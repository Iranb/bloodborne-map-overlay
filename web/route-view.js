'use strict';
// One continuous route across every height in the current area. Layer slices
// remain useful for terrain while the route and its destination stay visible.
(()=>{
 window.routeCrossings=[];
 const tools=document.createElement('div');tools.id='route-tools';tools.hidden=true;
 tools.innerHTML='<button id="route-overview"></button><span id="route-legend"></span>';
 const goal=document.createElement('button');goal.id='route-destination';goal.hidden=true;
 view.append(tools,goal);
 const distance3=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 let signature='';
 function crossings(){
  const data=window.routeData,fs=window.layerState?.floors;if(!data||data.mapId!==map?.id||!fs?.length)return [];
  const result=[];let travelled=0;
  for(let i=1;i<data.points.length;i++){
   const a=data.points[i-1],b=data.points[i],dy=b[1]-a[1],length=distance3(a,b);
   if(Math.abs(dy)>.0001){const boundaries=fs.slice(0,-1).map((f,j)=>({y:f.high,j})).filter(({y})=>dy>0?a[1]<y&&b[1]>=y:b[1]<y&&a[1]>=y);if(dy<0)boundaries.reverse();for(const {y,j} of boundaries){const t=(y-a[1])/dy;result.push({id:`route:${i}:${j}`,kind:'route',order:result.length+1,from:dy>0?j:j+1,to:dy>0?j+1:j,p:a.map((v,k)=>v+(b[k]-v)*t),distance:travelled+length*t});}}
   travelled+=length;
  }return result;
 }
 function sync(){
  const active=!!window.routeData;tools.hidden=!active;goal.hidden=!active;view.classList.toggle('routing',active);
  $('route-overview').textContent=tr('路線全貌','Whole route');$('route-legend').textContent=tr('金：本層 · 青虛線：其他層','Gold: this layer · Cyan dashes: other layers');
  if(active){const m=map.markers.find(m=>m.id===routeTarget),layer=window.layerAtHeight?.(routeData.goal[1]);goal.textContent=`◆ ${m?label(m):tr('目標','Target')}${layer>=0?' · L'+(layer+1):''}`;goal.title=tr('路線到達的路面位置','Destination on the walkable surface');}
  window.routeCrossings=crossings();window.refreshLayerLinks?.();
  signature=JSON.stringify(window.layerState?.contentFloors||[]);
 }
 function overview(){
  const data=window.routeData;if(!data)return;const box=new THREE.Box3();for(const p of data.points)box.expandByPoint(new THREE.Vector3(...p));const center=box.center(),size=box.size(),padding=miniMap?view.clientHeight/Math.max(110,view.clientHeight-105):1;target.copy(center);distance=Math.max(30,size.length()*1.15*padding);phi=.32;follow=false;viewFollow=false;toggleUI();syncMini();invalidate();
 }
 $('route-overview').onclick=overview;goal.onclick=overview;
 window.routeChanged=first=>{
  const data=window.routeData;
  if(data?.corridor?.length){
   const geometry=new THREE.BufferGeometry();geometry.addAttribute('position',new THREE.BufferAttribute(data.corridor,3));
   const contextMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{floorBottom:material.uniforms.floorBottom,floorTop:material.uniforms.floorTop},vertexShader:'varying float h;void main(){h=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying float h;uniform float floorBottom;uniform float floorTop;void main(){if(h>=floorBottom&&h<floorTop)discard;gl_FragColor=vec4(.25,.48,.57,.3);}',transparent:true,depthWrite:false});
   routeContext=new THREE.Mesh(geometry,contextMaterial);routeContext.renderOrder=2;scene.add(routeContext);
   window.markerSurfaces?.set(data.target,data.goal);
  }
  sync();if(first)overview();
 };
 window.updateRouteGuidance=function(){
  const data=window.routeData,points=data?.points;if(!live||!points?.length||!routeTarget||data.mapId!==map?.id)return;
  let best=Infinity,remaining=0,tail=0,along=0;
  for(let i=points.length-2;i>=0;i--){const a=points[i],b=points[i+1],v=b.map((x,j)=>x-a[j]),sq=v.reduce((s,x)=>s+x*x,0),t=sq?Math.max(0,Math.min(1,v.reduce((s,x,j)=>s+x*(live.p[j]-a[j]),0)/sq)):0,q=a.map((x,j)=>x+v[j]*t),gap=distance3(q,live.p),length=Math.sqrt(sq);if(gap<best){best=gap;remaining=tail+(1-t)*length;along=data.length-remaining;}tail+=length;}
  const marker=map.markers.find(m=>m.id===routeTarget),next=window.routeCrossings.find(c=>c.distance>along+.6);
  const step=next?`${tr('前行','In')} ${Math.max(0,next.distance-along).toFixed(0)} m ${tr(next.to>next.from?'上行':'下行',next.to>next.from?'go up':'go down')} L${next.to+1}`:tr('沿線到達目標','Follow route to destination');
  const gap=data.endGap>1.5?` · ${tr('道具離路面','Item above/near surface')} ${data.endGap.toFixed(1)} m`:'';
  routeStatus.textContent=`${marker?label(marker):''} · ${tr('沿路','Route')} ${remaining.toFixed(0)} m · ${step}${best>4?' · '+tr('偏離','Off route')+' '+best.toFixed(0)+' m':''}${gap}`;
 };
 const previousRender=render;render=function(){
  if(window.routeData&&signature!==JSON.stringify(window.layerState?.contentFloors||[]))sync();
  previousRender();if(!window.routeData)return;
  const p=new THREE.Vector3(...routeData.goal);p.y+=.8;p.project(camera);const visible=p.z>=-1&&p.z<=1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;mapHidden(goal,!visible);if(visible)mapPlace(goal,(p.x+1)*view.clientWidth/2,(1-p.y)*view.clientHeight/2);
 };
 const previousLocalize=localize;localize=function(){previousLocalize();sync();window.updateRouteGuidance();};
 const previousRefresh=refresh;refresh=function(){previousRefresh();window.updateLiveDistances?.();};
})();
