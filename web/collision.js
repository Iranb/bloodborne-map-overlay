'use strict';
(()=>{
 let worker=null,generation=0,positions=null,nodes=null,ids=null;
 const stack=[];
 window.collisionStats={ready:false,queries:0,triangles:0,nodes:0,buildMs:0};
 window.prepareCollision=function(source){
  worker?.terminate();nodes=ids=null;positions=source.geometry.attributes.position.array;
  const token=++generation,t=performance.now();window.collisionStats={ready:false,queries:0,triangles:0,nodes:0,buildMs:0};
  worker=new Worker('collision-worker.js');worker.onmessage=e=>{if(e.data.token!==generation)return;nodes=new Float32Array(e.data.nodes);ids=new Uint32Array(e.data.ids);Object.assign(window.collisionStats,{ready:true,nodes:nodes.length/8,buildMs:performance.now()-t});worker.terminate();worker=null;window.collisionReady?.();};
  const copy=positions.slice();worker.postMessage({token,buffer:copy.buffer},[copy.buffer]);
 };
 // Two-sided Moller-Trumbore intersection, matching the map's DoubleSide material.
 window.mapRaycast=function(o,d,near,far,cutY=Infinity){
  if(!nodes?.length)return null;window.collisionStats.queries++;
  let best=far,found=false;stack.length=0;stack.push(0);
  const origin=[o.x,o.y,o.z],direction=[d.x,d.y,d.z],a=positions;
  while(stack.length){const n=stack.pop()*8;let lo=near,hi=best,hit=true;
   for(let k=0;k<3;k++){if(Math.abs(direction[k])<1e-10){if(origin[k]<nodes[n+k]-1e-5||origin[k]>nodes[n+k+3]+1e-5){hit=false;break;}}else{let t1=(nodes[n+k]-origin[k])/direction[k],t2=(nodes[n+k+3]-origin[k])/direction[k];if(t1>t2){const t=t1;t1=t2;t2=t;}lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi+1e-5){hit=false;break;}}}
   if(!hit)continue;
   const left=nodes[n+6],right=nodes[n+7];if(left>=0){stack.push(left,right);continue;}
   const start=-left-1;
   for(let j=start;j<start+right;j++){window.collisionStats.triangles++;const at=ids[j]*9;
    const ex=a[at+3]-a[at],ey=a[at+4]-a[at+1],ez=a[at+5]-a[at+2],fx=a[at+6]-a[at],fy=a[at+7]-a[at+1],fz=a[at+8]-a[at+2];
    const px=d.y*fz-d.z*fy,py=d.z*fx-d.x*fz,pz=d.x*fy-d.y*fx,det=ex*px+ey*py+ez*pz;if(Math.abs(det)<1e-10)continue;
    const tx=o.x-a[at],ty=o.y-a[at+1],tz=o.z-a[at+2],u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
    const qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,v=(d.x*qx+d.y*qy+d.z*qz)/det;if(v<0||u+v>1)continue;
    const t=(fx*qx+fy*qy+fz*qz)/det;if(t<near||t>best||o.y+t*d.y>=cutY)continue;best=t;found=true;
   }
  }
  return found?{distance:best,point:{y:o.y+best*d.y}}:null;
 };
})();
