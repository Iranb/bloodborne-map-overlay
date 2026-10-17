'use strict';
// Integration with the existing offline map; original marker IDs and manual
// records remain unchanged. Live updates stop when the host loses its reader.
let live=null,follow=true,viewFollow=true,autoMap=true,autoCut=true,autoProgress=true;
let navigation=null,routeContext=null,navWorker=null,navReady=false,navMap='',routeTarget=null,routeRequest=0,lastRouteAt=0,lastRouteP=null;
let lastPositionStatus=null;
let lastRefreshAt=0,lastCoverAt=0,cutHeight=1e6,coverActive=false,english=false;
let autoRecords={};try{autoRecords=JSON.parse(localStorage.getItem('bloodborne-auto-v1')||'{}');}catch{}
function tr(zh,en){return english?en:zh;}
function button(id,zh,en,handler,on=false){const b=document.createElement('button');b.id=id;b.dataset.zh=zh;b.dataset.en=en;b.textContent=zh;b.onclick=handler;b.setAttribute('aria-pressed',on);$('live-toolbar').append(b);return b;}
const bar=document.createElement('div');bar.id='live-toolbar';document.body.append(bar);
button('follow','跟隨','Follow',()=>{follow=!follow;toggleUI();if(follow&&live)distance=55;invalidate();},true);
button('view-follow','視向','View',()=>{viewFollow=!viewFollow;toggleUI();invalidate();},true);
button('auto-map','自動切圖','Auto area',()=>{autoMap=!autoMap;toggleUI();},true);
button('auto-cut','切屋頂','Cut roof',()=>{autoCut=!autoCut;cutHeight=1e6;toggleUI();invalidate();},true);
button('route','導航','Route',()=>{if(routeTarget){clearRoute();}else if(selected)navigate(selected);else recommend();});
button('auto-progress','自動進度','Auto progress',()=>{autoProgress=!autoProgress;toggleUI();refresh();},true);
button('pad-mode','手柄','Gamepad',()=>host('gamepad'));
button('borderless','無邊框','Borderless',()=>host('borderless'));
button('language','EN','繁中',()=>{english=!english;localStorage.setItem('bloodborne-language',english?'en':'zh');localize();refresh();});
const state=document.createElement('span');state.id='live-status';state.textContent='等待遊戲 · 可離線瀏覽';bar.append(state);
const arrow=document.createElement('div');arrow.id='player-arrow';arrow.textContent='▲';arrow.hidden=true;view.append(arrow);
const routeStatus=document.createElement('div');routeStatus.id='route-status';view.append(routeStatus);routeStatus.hidden=true;
function toggleUI(){for(const [id,v] of Object.entries({follow,'view-follow':viewFollow,'auto-map':autoMap,'auto-cut':autoCut,'auto-progress':autoProgress}))$(id).setAttribute('aria-pressed',v);}
function saveAuto(){try{localStorage.setItem('bloodborne-auto-v1',JSON.stringify(autoRecords));}catch{notify(tr('自動進度儲存失敗','Could not save automatic progress'));}}
function autoState(){if(!live)return null;return autoRecords[live.name]||(autoRecords[live.name]={done:{},observed:[]});}
const originalCompleted=completed;
completed=function(m){if(Object.prototype.hasOwnProperty.call(records(),m.id))return originalCompleted(m);return autoProgress&&!!autoState()?.done[m.id];};
const originalReset=resetView;resetView=function(){if(window.mapReady)follow=false;toggleUI();originalReset();};$('reset').onclick=resetView;renderer.domElement.ondblclick=resetView;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)viewFollow=false;else follow=false;toggleUI();});
const originalLoad=loadMap;
loadMap=async function(id){clearRoute();navReady=false;navMap='';navWorker?.terminate();navWorker=null;const beforeFollow=follow;await originalLoad(id);follow=beforeFollow;toggleUI();};
const originalFocus=focusMarker;
focusMarker=function(id){const m=map.markers.find(x=>x.id===id);if(live&&map.id===live.mapId&&m?.p){selected=id;if(routeTarget===id)clearRoute();else if(!completed(m))navigate(id);refresh();return;}originalFocus(id);};
function disposeRoute(){window.routePoints=null;window.routeData=null;for(const object of [navigation,routeContext])if(object){scene.remove(object);object.geometry.dispose();object.material.dispose();}navigation=null;routeContext=null;window.routeChanged?.();}
function clearRoute(){disposeRoute();routeTarget=null;routeRequest++;lastRouteP=null;$('route').setAttribute('aria-pressed',false);routeStatus.hidden=true;invalidate();}
function navigationWorker(){if(navWorker&&navMap===map.id)return;navWorker?.terminate();navReady=false;navMap=map.id;window.markerSurfaces=new Map();navWorker=new Worker('route-worker.js?v=routes-3');const token=navMap;
 navWorker.onmessage=e=>{const d=e.data;if(d.token!==map.id)return;if(d.type==='built'){navReady=true;navWorker.postMessage({type:'anchors',token,markers:map.markers.filter(m=>m.p).map(m=>({id:m.id,p:m.p}))});if(routeTarget)requestRoute();return;}if(d.type==='anchors'){window.markerSurfaces=new Map(d.anchors.filter(a=>a.p).map(a=>[a.id,a.p]));window.updateLiveDistances?.();invalidate();return;}if(d.request!==routeRequest)return;if(d.type==='error'){disposeRoute();routeStatus.textContent=english?(d.errorEn||d.error):d.error;routeStatus.hidden=false;invalidate();return;}const first=!window.routeData||window.routeData.target!==routeTarget;disposeRoute();window.routePoints=d.points;window.routeData={...d,target:routeTarget,mapId:map.id};const geometry=new THREE.Geometry();for(const p of d.points)geometry.vertices.push(new THREE.Vector3(p[0],p[1]+.25,p[2]));geometry.computeLineDistances();navigation=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xf0c36a,depthTest:false,transparent:true,opacity:.95}));navigation.renderOrder=5;scene.add(navigation);window.routeChanged?.(first);routeStatus.hidden=false;window.updateRouteGuidance?.();invalidate();};
 const positions=mesh.geometry.attributes.position.array.slice();navWorker.postMessage({type:'build',token,positions:positions.buffer},[positions.buffer]);
}
function navigate(id){if(!live||live.mapId!==map.id){notify(tr('等待此區域的人物定位','Waiting for player in this area'));return;}const m=map.markers.find(x=>x.id===id);if(!m?.p)return;if(routeTarget!==id)disposeRoute();routeTarget=id;$('route').setAttribute('aria-pressed',true);routeStatus.hidden=false;routeStatus.textContent=tr('正在建立可行走地形路線…','Building collision route…');navigationWorker();if(navReady)requestRoute();}
function requestRoute(){if(!live||!routeTarget||!navReady)return;const m=map.markers.find(x=>x.id===routeTarget);if(!m?.p)return;lastRouteAt=Date.now();lastRouteP=[...live.p];navWorker.postMessage({type:'route',token:map.id,request:++routeRequest,from:live.p,to:m.p});}
function ceiling(){if(!autoCut||!follow||!live||Date.now()-lastCoverAt<800)return;lastCoverAt=Date.now();cutHeight=1e6;coverActive=false;
 for(const [dx,dz] of [[0,0],[.6,0],[-.6,0],[0,.6],[0,-.6]]){const origin=new THREE.Vector3(live.p[0]+dx,live.p[1]+1.6,live.p[2]+dz);const hit=window.mapRaycast(origin,new THREE.Vector3(0,1,0),.2,14);if(hit&&hit.distance>1){cutHeight=Math.min(cutHeight,origin.y+hit.distance-.1);coverActive=true;}}
 $('auto-cut').classList.toggle('detected',coverActive);
}
const originalRender=render;
render=function(){if(live&&map?.id===live.mapId){if(follow){target.set(live.p[0],live.p[1]+1,live.p[2]);if(viewFollow&&live.cameraYaw!==null)theta=live.cameraYaw+Math.PI;ceiling();if(coverActive)phi=Math.min(phi,.42);}
 material.uniforms.cutY.value=cut?Number($('height').value):(autoCut&&follow?cutHeight:1e6);
 }originalRender();if(!live||map?.id!==live.mapId){arrow.hidden=true;return;}
 const a=new THREE.Vector3(...live.p);a.y+=.8;const b=a.clone().add(new THREE.Vector3(Math.sin(live.yaw),0,Math.cos(live.yaw)));a.project(camera);b.project(camera);const w=view.clientWidth,h=view.clientHeight;mapHidden(arrow,a.z<-1||a.z>1||Math.abs(a.x)>1||Math.abs(a.y)>1);const heading=Math.atan2((b.x-a.x)*w,(b.y-a.y)*h);if(!arrow.hidden)mapPlace(arrow,(a.x+1)*w/2,(1-a.y)*h/2,heading);
 for(const {m,node} of markerNodes){if(node.hidden)continue;const dy=(window.markerSurfaces?.get(m.id)||m.p)[1]-live.p[1];mapStyle(node,'opacity',Math.abs(dy)>5?'0.28':completed(m)?'0.4':'1');}
};
const originalRefresh=refresh;
refresh=function(){originalRefresh();if(!map)return;for(const row of $('list').children){const m=map.markers.find(x=>x.id===row.dataset.id);if(!m)continue;if(english){const button=row.querySelector('button');if(button?.firstChild)button.firstChild.textContent=m.en||m.kind+' #'+(m.entity||m.id.split(':').at(-1));row.querySelector('small').textContent=m.kind+(m.p?' · Elevation '+m.p[1].toFixed(1):' · Unlocated');}if(live?.mapId===map.id&&m.p){const d=Math.hypot(...m.p.map((v,i)=>v-live.p[i])),dy=m.p[1]-live.p[1];row.querySelector('small').textContent=`${d.toFixed(1)} m${dy>4?' · '+tr('上層','Above'):dy< -4?' · '+tr('下層','Below'):' · '+tr('附近樓層','Same level')}`;}}
 if(routeTarget&&map.markers.some(m=>m.id===routeTarget&&completed(m)))clearRoute();
};
window.receivePosition=async function(payload){if(!window.mapReady)return;lastPositionStatus=payload;const p=payload.position;
 if(!p||!Array.isArray(p.p)||p.p.length!==3||p.p.some(x=>!Number.isFinite(x))||typeof p.mapId!=='string'){live=null;arrow.hidden=true;$('live-status').textContent=(english?payload.statusEn:payload.status)||tr('等待遊戲','Waiting for game');return;}
 const first=!live;live=p;
 mapText($('live-status'),`${p.name} · Lv.${p.level} · ${p.mapId}${database.maps.some(m=>m.id===p.mapId)?'':tr('（此區域尚未收錄）',' (area unavailable)')}`);
 if(autoMap&&map?.id!==p.mapId&&database.maps.some(m=>m.id===p.mapId)){follow=true;await loadMap(p.mapId);}
 if(first&&follow)distance=55;
 if(map?.id===p.mapId&&autoProgress){let changed=false;const s=autoState();if(s)for(const m of map.markers)if(m.kind==='npc'&&m.p&&Math.hypot(...m.p.map((v,i)=>v-p.p[i]))<4&&!s.done[m.id]){s.done[m.id]=true;changed=true;}if(changed){saveAuto();refresh();}}
 if(Date.now()-lastRefreshAt>1000){lastRefreshAt=Date.now();window.updateLiveDistances?.();}
 if(routeTarget&&Date.now()-lastRouteAt>2000&&lastRouteP&&Math.hypot(...p.p.map((v,i)=>v-lastRouteP[i]))>4)requestRoute();invalidate();
};
window.receiveProgress=function(p){const s=autoState();if(!s)return;s.observed=[...new Set([...s.observed,...(p.items||[]),...(p.runes||[]).map(x=>'rune:'+x)])];const owned=new Set(s.observed);let changed=false;
 for(const area of database.maps)for(const m of area.markers){if(['weapon','armor','key','rune','tool'].includes(m.kind)&&m.ownership?.length&&m.ownership.every(x=>owned.has(x))&&!s.done[m.id]){s.done[m.id]=true;changed=true;}}
 const bossAliases={'Cleric Beast':2410800,'Father Gascoigne':2410810,'Vicar Amelia':2400800,'Celestial Emissary':2420810,'Ebrietas':2420800,'Blood Starved Beast':2300800,'Shadow Of Yharnam':2700800,'Rom':3200800,'One Reborn':2800800,'Micolash':2600850,"Mergo's Wet Nurse":2600800,'Gehrman':2100800,'Moon Presence':2100810,'Dark Beast Paarl':2300810,'Witch Of Hemwick':2200800,'Martyr Logarius':2500800,'Amygdala':3300800,'Ludwig':3400800,'Living Failures':3500850,'Lady Maria':3500800,'Kos':3600800,'Laurence':3400850};
 for(const name of p.bosses||[]){const id=bossAliases[name];if(!id)continue;const m=database.maps.flatMap(x=>x.markers).find(x=>x.kind==='boss'&&x.entity===id);if(m&&!s.done[m.id]){s.done[m.id]=true;changed=true;}}
 s.slot=p.slot;s.savedAt=p.savedAt;saveAuto();refresh();
};
function localize(){for(const b of bar.querySelectorAll('button'))b.textContent=english?b.dataset.en:b.dataset.zh;for(const opt of $('map').options){const m=database?.maps.find(m=>m.id===opt.value);if(m)opt.textContent=(m.dlc?'DLC · ':'')+(english?m.en:m.name);}if(map){$('area-name').textContent=english?map.en:map.name;$('area-en').textContent=english?map.name:map.en;}$('search').placeholder=tr('搜尋名稱、中英文或編號','Search name or ID');}
window.receiveGamepad=function(p){if(p.buttons&0x1000)$('follow').click();if(p.buttons&0x4000)$('route').click();if(p.buttons&0x8000){if(enabled.size)enabled.clear();else Object.keys(categories).forEach(x=>enabled.add(x));for(const b of $('filters').children){b.classList.toggle('active',enabled.has(b.dataset.kind));b.setAttribute('aria-pressed',enabled.has(b.dataset.kind));}refresh();}if(p.buttons&0x40)$('view-follow').click();if(p.buttons&0x80)resetView();if(p.x||p.y){viewFollow=false;theta-=p.x*.045;phi=Math.max(.04,Math.min(1.5,phi+p.y*.025));}if(p.panX||p.panY){follow=false;target.x+=p.panX*distance*.013;target.z-=p.panY*distance*.013;}if(p.zoom)distance=Math.max(5,Math.min(fullDistance*2,distance*Math.exp(p.zoom*.04)));toggleUI();invalidate();};
window.chrome?.webview?.addEventListener('message',e=>{const m=e.data;if(m.action==='position')window.receivePosition(m);if(m.action==='progress')window.receiveProgress({...m.progress,offline:!!m.offline,pid:m.pid});if(m.action==='gamepad')window.receiveGamepad(m);if(m.action==='gamepad-mode')$('pad-mode').setAttribute('aria-pressed',m.active);if(m.action==='notice')notify((english?m.textEn:m.text)||m.text);});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){clearRoute();host('exit-gamepad');}if(e.key==='Enter'&&selected)navigate(selected);if(e.code==='Space'&&selected){e.preventDefault();setDone(selected,!completed(map.markers.find(m=>m.id===selected)));}});
