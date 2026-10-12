'use strict';
// Commit position-driven DOM changes and WebGL together. A render-only throttle
// leaves the browser compositor updating on the native reader's separate clock.
(()=>{
 let hostActive=true,timer=0,raf=0,lastFrame=0,lastPositionKey=null,interactiveUntil=0;
 let flushing=false,queue=[],waiters=[];
 const receive=window.receivePosition;
 const active=()=>hostActive&&!document.hidden;
 const interval=()=>performance.now()<interactiveUntil?50:live?(miniMap?500:250):100;
 window.mapFrameStats={commits:0,received:0,coalesced:0};
 function schedule(){
  if(!active()||!window.mapReady||flushing||framePending)return;
  framePending=true;
  timer=setTimeout(()=>{timer=0;raf=requestAnimationFrame(commit);},Math.max(0,interval()-(performance.now()-lastFrame)));
 }
 async function commit(){
  raf=0;framePending=false;if(!active())return;
  flushing=true;
  const batch=queue;queue=[];const completed=waiters;waiters=[];
  try{
   // Preserve NPC proximity and area observations while avoiding intermediate
   // paints and overlapping async area loads.
   for(const payload of batch)await receive(payload);
   if(active()&&dirty){render();window.mapFrameStats.commits++;}
   completed.forEach(p=>p.resolve());
  }catch(error){completed.forEach(p=>p.reject(error));console.error(error);}
  finally{lastFrame=performance.now();flushing=false;if(queue.length||dirty)schedule();}
 }
 invalidate=function(){dirty=true;schedule();};
 const interact=()=>{interactiveUntil=performance.now()+1000;if(timer){clearTimeout(timer);timer=0;framePending=false;schedule();}};
 document.addEventListener('pointerdown',interact,{passive:true});
 document.addEventListener('pointermove',e=>{if(e.buttons)interact();},{passive:true});
 document.addEventListener('wheel',interact,{passive:true});
 document.addEventListener('keydown',interact);
 window.setMapActive=function(value){hostActive=!!value;if(!active()){clearTimeout(timer);cancelAnimationFrame(raf);timer=raf=0;framePending=false;if(queue.length>1)queue=queue.slice(-1);waiters.splice(0).forEach(p=>p.resolve());}else invalidate();};
 document.addEventListener('visibilitychange',()=>window.setMapActive(hostActive));
 window.chrome?.webview?.addEventListener('message',e=>{if(e.data.action==='activity')window.setMapActive(e.data.active);});
 window.receivePosition=function(payload){
  window.mapFrameStats.received++;
  const key=JSON.stringify(payload.position??{status:payload.status});
  if(key===lastPositionKey)return Promise.resolve();lastPositionKey=key;
  if(!active()||!window.mapReady){queue=[payload];return Promise.resolve();}
  if(queue.length)window.mapFrameStats.coalesced++;
  if(queue.length>=32)queue.shift();queue.push(payload);
  const result=new Promise((resolve,reject)=>waiters.push({resolve,reject}));schedule();return result;
 };
 const readyTimer=setInterval(()=>{if(!window.mapReady)return;clearInterval(readyTimer);invalidate();host('ready');},100);
})();
