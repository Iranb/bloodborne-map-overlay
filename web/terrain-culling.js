'use strict';
(()=>{
 let worker=null,group=null,source=null,token=0,enabled=true;
 let roadOnly=true;try{roadOnly=localStorage.getItem('bloodborne-road-view')!=='full';}catch{}
 window.terrainStats={ready:false,tiles:0,triangles:0,sourceTriangles:0,roadOnly};
 const controls=[];
 function syncControls(){for(const b of controls){b.textContent=tr(roadOnly?'路面':'完整',roadOnly?'Roads':'Full');mapAttribute(b,'aria-pressed',roadOnly);b.title=tr('路面：保留朝上的地面與緩坡。靜態坡度篩選不保證可到達；門、升降機及梯子仍依遊戲狀態。點擊切换完整模型。','Roads: upward floors and slopes. Static filtering does not prove reachability; doors, lifts and ladders depend on the game. Click for full geometry.');}}
 for(const parent of [document.querySelector('nav'),document.getElementById('mini-controls')]){
  if(!parent)continue;const b=document.createElement('button');b.id=parent.id==='mini-controls'?'mini-roads':'terrain-roads';b.onclick=()=>window.setTerrainRoadOnly(!roadOnly);parent.insertBefore(b,parent.id==='mini-controls'?document.getElementById('mini-state'):document.getElementById('panel-button'));controls.push(b);
 }
 const localizeBefore=localize;localize=function(){localizeBefore();syncControls();};syncControls();
 const draw=renderer.render.bind(renderer);
 renderer.render=function(...args){
  if(group&&source){
   // A road overview must never fall back to the complete building mesh.
   const tiled=roadOnly||(enabled&&distance<fullDistance*.5);
   group.visible=tiled;source.visible=!tiled;
   if(tiled)for(const part of group.children){const box=part.geometry.boundingBox;part.visible=box.min.y<Math.min(material.uniforms.cutY.value,material.uniforms.floorTop.value)&&box.max.y>=material.uniforms.floorBottom.value;part.frustumCulled=enabled;}
  }
  return draw(...args);
 };
 function clear(){worker?.terminate();worker=null;if(group){scene.remove(group);for(const m of group.children)m.geometry.dispose();group=null;}}
 window.setTerrainCullingEnabled=value=>{enabled=!!value;invalidate();};
 window.setTerrainRoadOnly=function(value){
  const next=!!value;if(next===roadOnly)return;roadOnly=next;
  try{localStorage.setItem('bloodborne-road-view',roadOnly?'roads':'full');}catch{}
  syncControls();if(source)build(source);invalidate();
 };
 function build(next){
  clear();source=next;const generation=++token;next.visible=true;
  window.terrainStats={ready:false,tiles:0,triangles:0,sourceTriangles:next.geometry.attributes.position.count/3,roadOnly};
  const task=new Worker('terrain-worker.js');worker=task;
  task.onerror=()=>{if(generation!==token)return;task.terminate();worker=null;next.visible=true;window.terrainStats.error=true;notify(tr('路面模型建立失敗，暫時顯示完整地形。','Road model failed; showing full terrain.'));invalidate();};
  task.onmessage=({data})=>{
   if(data.token!==token||source!==next)return;
   task.terminate();worker=null;
   if(data.sourceTriangles!==next.geometry.attributes.position.count/3||data.roadOnly!==roadOnly)return;
   group=new THREE.Group();
   for(const tile of data.tiles){
    const geometry=new THREE.BufferGeometry();
    geometry.addAttribute('position',new THREE.BufferAttribute(new Float32Array(tile.positions),3));
    geometry.addAttribute('normal',new THREE.BufferAttribute(new Float32Array(tile.normals),3));
    geometry.computeBoundingSphere();geometry.computeBoundingBox();
    const part=new THREE.Mesh(geometry,next.material);part.frustumCulled=enabled;group.add(part);
   }
   scene.add(group);group.visible=true;next.visible=false;
   window.terrainStats={ready:true,tiles:group.children.length,triangles:data.triangles,sourceTriangles:data.sourceTriangles,roadOnly};invalidate();
  };
  const positions=next.geometry.attributes.position.array.slice(),normals=next.geometry.attributes.normal.array.slice();
  task.postMessage({token:generation,roadOnly,positions:positions.buffer,normals:normals.buffer},[positions.buffer,normals.buffer]);
 }
 const prepare=window.prepareCollision;
 window.prepareCollision=function(next){prepare?.(next);build(next);};
 if(mesh)window.prepareCollision(mesh);
})();
