'use strict';
// All topology is precomputed from static assets. Layer input adds no game reads.
(()=>{
 const css=document.createElement('link');css.rel='stylesheet';css.href='layers.css?v=routes-3';document.head.append(css);
 let catalog=null,area=null,index=null,pinned=false,chosen=null,linksOpen=false,nodes=[];
 let generation=0,ready=false,drawnChosen=undefined,playerIndex=null;
 const layerMargin=.45;
 const controls=document.createElement('div');controls.id='layer-controls';controls.hidden=true;
 controls.innerHTML='<button id="layer-down">▼</button><select id="layer-select" aria-label="瀏覽樓層"></select><button id="layer-up">▲</button><button id="layer-player"></button><button id="layer-links"></button>';
 const list=document.createElement('div');list.id='layer-connections';list.hidden=true;
 const marks=document.createElement('div');marks.id='layer-link-markers';
 const detail=document.createElement('div');detail.id='layer-link-detail';detail.hidden=true;
 view.append(controls,list,marks,detail);
 const dataPromise=fetch('data/layers.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(d=>{catalog=d.maps;return d;}).catch(e=>{console.error(e);notify(tr('分層資料讀取失敗，仍可瀏覽完整地形。','Layers unavailable; full terrain remains available.'));return null;});
 const contentKinds=new Set(['npc','weapon','armor','rune','key','tool','gem','item']);
 function contentLayers(raw){
  const counts=raw.floors.map(f=>({npc:0,items:0}));
  for(const m of map.markers){if(!m.p||!contentKinds.has(m.kind))continue;const i=raw.floors.findIndex(f=>m.p[1]>=f.low&&m.p[1]<f.high);if(i>=0)counts[i][m.kind==='npc'?'npc':'items']++;}
  // Completed targets and current category filters do not change the structure.
  const occupied=raw.floors.filter(f=>counts[f.index].npc+counts[f.index].items>0);
  if(!occupied.length)return{floors:[],contentFloors:[],links:[],sourceFloorCount:raw.floors.length};
  const mapping=raw.floors.map(f=>{let nearest=0;for(let i=1;i<occupied.length;i++)if(Math.abs(f.index-occupied[i].index)<Math.abs(f.index-occupied[nearest].index))nearest=i;return nearest;});
  // Assign empty bands to the nearest content band. Geometry stays continuous;
  // only redundant layer boundaries disappear, and original anchors stay exact.
  const floors=occupied.map((f,index)=>{const members=raw.floors.filter(x=>mapping[x.index]===index);return{...f,index,low:members[0].low,high:members.at(-1).high,sourceIndex:f.index,content:counts[f.index],triangles:members.reduce((n,x)=>n+x.triangles,0)};});
 // A slice-plane intersection is not a verified stair/ladder entrance. Only
 // actual route crossings may claim to connect displayed floors.
 const links=raw.links.filter(l=>l.kind!=='road').map(l=>({...l,from:mapping[l.from],to:null}));
  return{floors,contentFloors:floors.map(f=>({index:f.index,low:f.low,high:f.high,...f.content})),links,sourceFloorCount:raw.floors.length};
 }
 const floor=()=>index===null?null:area?.floors[index];
 const at=y=>{if(!area)return 0;const i=area.floors.findIndex(f=>y<f.high);return i<0?area.floors.length-1:i;};
 const contains=y=>!floor()||(y>=floor().low&&y<floor().high);
 const playerY=()=>live?.mapId===map?.id&&Number.isFinite(live?.p?.[1])?live.p[1]:null;
 // Track the player's floor separately from a manually browsed floor. Keep the
 // last floor within a small boundary margin so steps and ramps do not flicker.
 function trackPlayer(){const y=playerY();if(y===null||!area?.floors.length)return null;const previous=area.floors[playerIndex];return previous&&y>=previous.low-layerMargin&&y<previous.high+layerMargin?playerIndex:at(y);}
 window.layerContains=contains;
 window.layerAtHeight=at;
 window.markerLayerLabel=m=>{const p=window.markerSurfaces?.get(m.id);if(!p||playerY()===null||!area?.floors.length)return tr('高度待確認','Height unconfirmed');const dest=at(p[1]),from=trackPlayer();return dest===from?tr('同層','Same layer'):`L${dest+1} · ${tr(dest>from?'需上行':'需下行',dest>from?'Go up':'Go down')}`;};
 const title=i=>`L${i+1}`;
 const name=link=>{if(link.kind==='route')return `${link.order}. ${tr(link.to>link.from?'沿路上行':'沿路下行',link.to>link.from?'Follow path up':'Follow path down')} ${title(link.from)} → ${title(link.to)}`;const marker=map.markers.find(m=>m.id===link.marker);return marker?label(marker):link.id;};
 const symbol=link=>link.kind==='route'?`${link.order}${link.to>link.from?'↑':'↓'}`:link.kind==='ladder'?tr('梯','L'):link.kind==='mechanism'?tr('機','M'):tr('門','D');
 const allLinks=()=>[...(window.routeCrossings||[]),...(area?.links||[])];
 function snapshot(){window.layerState={ready,mapId:map?.id,index,pinned,playerIndex,floor:floor(),floors:area?.floors||[],floorCount:area?.floors.length||0,sourceFloorCount:area?.sourceFloorCount||0,contentFloors:area?.contentFloors||[],connectionCount:allLinks().length,selectedLink:chosen};}
 function apply(){material.uniforms.floorBottom.value=floor()?.low??-1e6;material.uniforms.floorTop.value=floor()?.high??1e6;snapshot();}
 function relevant(){return allLinks().filter(l=>l.kind==='route'||index===null||l.from===index);}
 window.refreshLayerLinks=()=>{if(ready){snapshot();buildLinks();invalidate();}};
 function choose(next,manual=true){if(!area)return;if(manual)playerIndex=trackPlayer();index=next===null||!area.floors.length?null:Math.max(0,Math.min(area.floors.length-1,next));pinned=manual;chosen=null;detail.hidden=true;if(index!==null&&manual&&cut){cut=false;$('slice-control').hidden=true;mapAttribute($('slice'),'aria-pressed',false);applySlice();}apply();ui();buildLinks();invalidate();}
 function browse(next){choose(next);follow=false;viewFollow=false;toggleUI();syncMini();if(!floor())return;const candidates=relevant().filter(l=>l.kind==='road').sort((a,b)=>Math.hypot(a.p[0]-target.x,a.p[2]-target.z)-Math.hypot(b.p[0]-target.x,b.p[2]-target.z));const point=candidates[0]?.p??floor().focus;if(point&&Math.hypot(point[0]-target.x,point[2]-target.z)>distance*.6){target.x=point[0];target.z=point[2];}target.y=(floor().low+floor().high)/2;invalidate();}
 function step(delta){if(!area?.floors.length||document.querySelector('dialog[open]'))return;const base=index??at(live?.mapId===map.id?live.p[1]:target.y);const next=Math.max(0,Math.min(area.floors.length-1,base+delta));if(next===base){notify(tr(delta>0?'已到最高層':'已到最低層',delta>0?'Highest layer':'Lowest layer'));return;}browse(next);}
 window.stepMapLayer=step;
 window.selectMapLayer=(next)=>choose(next);
 window.followPlayerLayer=function(){const next=trackPlayer();if(next!==null)playerIndex=next;choose(next??at(target.y),false);follow=true;viewFollow=true;distance=miniMap?38:55;toggleUI();syncMini();invalidate();};
 window.restoreMapLayer=s=>{if(s&&area)choose(s.index,s.pinned);};
 function ui(){
  controls.hidden=!ready||!area?.floors.length;if(!area)return;
  const select=$('layer-select');select.replaceChildren();const all=document.createElement('option');all.value='all';all.textContent=tr('全部樓層','All layers');select.append(all);
  for(const f of area.floors){const opt=document.createElement('option');opt.value=f.index;opt.textContent=`${title(f.index)} · ${f.low}～${f.high} m`;opt.title=`NPC ${f.content.npc} · ${tr('物品','Items')} ${f.content.items}`;select.append(opt);}
  select.value=index===null?'all':String(index);select.title=tr('只列含 NPC 或物品的層；空層道路併入相鄰層。非官方樓層編號。','Only layers with NPCs or items; empty roads join nearby layers. Not official floor numbers.');
  $('layer-down').disabled=index===0;$('layer-up').disabled=index===area.floors.length-1;
  $('layer-down').title=tr('下層 · 手柄方向鍵下','Lower layer · D-pad down');$('layer-up').title=tr('上層 · 手柄方向鍵上','Upper layer · D-pad up');
  mapText($('layer-player'),tr('自動樓層','Auto layer'));mapAttribute($('layer-player'),'aria-pressed',!pinned&&index!==null);
  $('layer-player').title=tr('跟隨人物所在層；手動瀏覽在人物換層後自動恢復','Follow the player’s layer; manual browsing ends when the player changes layer');
  mapText($('layer-links'),tr('連接','Links'));mapAttribute($('layer-links'),'aria-pressed',linksOpen);
  list.hidden=!linksOpen;
 }
 function buildLinks(){
  marks.replaceChildren();list.replaceChildren();nodes=[];drawnChosen=undefined;if(!area)return;
  const note=document.createElement('p');note.textContent=tr('編號箭頭依導航順序標出實際路線換層處。梯子／機關僅為互動位置，沒有確認的另一端。','Numbered arrows follow the route between layers. Ladder/device icons mark interactions with unconfirmed destinations.');list.append(note);
  const candidates=relevant();
  // Stable order keeps list browsing predictable; nearest links appear first.
  const origin=live?.mapId===map.id?live.p:target.toArray();candidates.sort((a,b)=>(a.kind==='route'?0:1)-(b.kind==='route'?0:1)||(a.kind==='route'?a.order-b.order:Math.hypot(a.p[0]-origin[0],a.p[2]-origin[2])-Math.hypot(b.p[0]-origin[0],b.p[2]-origin[2])));
  for(const l of candidates){
   const node=document.createElement('button');node.className='layer-link-marker';node.dataset.id=l.id;node.dataset.kind=l.kind;node.textContent=symbol(l);node.title=name(l);node.setAttribute('aria-label',name(l));node.onclick=()=>focus(l.id);marks.append(node);nodes.push({l,node});
   const row=document.createElement('div');row.className='layer-link-row';row.dataset.id=l.id;
   const button=document.createElement('button');button.textContent=name(l);button.onclick=()=>focus(l.id);row.append(button);
   if(l.to!==null&&index!==null){const jump=document.createElement('button');jump.className='layer-jump';jump.textContent=title(index===l.from?l.to:l.from)+' ↗';jump.onclick=()=>jumpLink(l.id);row.append(jump);}
   list.append(row);
  }
  if(!candidates.length){const empty=document.createElement('p');empty.textContent=tr('本層尚無已確認的連接位置。','No evidenced crossings in this layer.');list.append(empty);}
 }
 function focus(id){
  const link=allLinks().find(l=>l.id===id);if(!link)return;
  follow=false;viewFollow=false;toggleUI();syncMini();target.set(...link.p);distance=Math.max(24,Math.min(distance,48));chosen=id;
  detail.hidden=false;detail.innerHTML=`<b>${esc(name(link))}</b><p>${esc(link.kind==='route'?tr('沿導航線繼續走到另一層；箭頭是路線經過分層邊界的位置，不代表獨立梯子或入口。','Continue along the route to the next layer. This marks a route crossing, not a separate ladder or entrance.'):tr('事件確認的互動位置；另一端及機關狀態需在遊戲確認。','Event-confirmed interaction position; check its destination and state in game.'))}</p>${link.to!==null?'<button id="layer-link-jump"></button>':''}<button id="layer-link-close">${tr('關閉','Close')}</button>`;
  if(link.to!==null){$('layer-link-jump').textContent=tr('查看另一層','Other layer');$('layer-link-jump').onclick=()=>jumpLink(id);}
  $('layer-link-close').onclick=()=>{chosen=null;detail.hidden=true;snapshot();invalidate();};snapshot();invalidate();
 }
 function jumpLink(id){const link=allLinks().find(l=>l.id===id);if(!link||link.to===null)return;const next=index===link.to?link.from:link.to;choose(next);focus(id);}
 function project(){
  const changed=drawnChosen!==chosen;
  for(const {l,node} of nodes){const p=new THREE.Vector3(...l.p);p.y+=.35;p.project(camera);const near=!miniMap||Math.hypot(l.p[0]-target.x,l.p[2]-target.z)<distance*1.5||l.id===chosen;const visible=near&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;mapHidden(node,!visible);if(visible)mapPlace(node,(p.x+1)*view.clientWidth/2,(1-p.y)*view.clientHeight/2);if(changed)node.classList.toggle('selected',l.id===chosen);}
  if(changed){for(const row of list.querySelectorAll('.layer-link-row'))row.classList.toggle('selected',row.dataset.id===chosen);drawnChosen=chosen;}
 }
 async function load(){
  const token=++generation;ready=false;area=null;index=null;playerIndex=null;controls.hidden=true;list.hidden=true;detail.hidden=true;marks.replaceChildren();nodes=[];apply();
  await dataPromise;if(token!==generation||!map||!catalog)return;
  area=catalog[map.id]?contentLayers(catalog[map.id]):null;ready=!!area;if(!area)return;const anchor=live?.mapId===map.id?live.p:(map.markers.find(m=>m.kind==='lamp'&&m.p)?.p??null);index=area.floors.length?at(anchor?.[1]??target.y):null;playerIndex=trackPlayer();pinned=false;chosen=null;
  // A full-area camera can aim between detached subareas (lecture building / lake).
  // Start a height slice near a known anchor rather than leaving an empty view.
  if(anchor){target.set(...anchor);distance=miniMap?38:55;phi=.4;}
  else if(floor()?.focus){target.set(...floor().focus);distance=miniMap?38:55;phi=.4;}
  apply();ui();buildLinks();invalidate();
 }
 const previousLoad=loadMap;loadMap=async function(id){generation++;ready=false;area=null;index=null;playerIndex=null;nodes=[];controls.hidden=true;list.hidden=true;detail.hidden=true;marks.replaceChildren();apply();const before=loadToken;await previousLoad(id);if(loadToken===before+1)await load();};
 const previousPosition=window.receivePosition;window.receivePosition=async function(p){
  await previousPosition(p);
  if(!live){playerIndex=null;snapshot();return;}
  if(!ready||playerY()===null||!area?.floors.length)return;
  const previous=playerIndex,next=trackPlayer();playerIndex=next;
  if(pinned){if(previous===null||next!==previous)window.followPlayerLayer();else snapshot();}
  else if(index!==next)choose(next,false);else snapshot();
 };
 window.revealMarkerLayer=m=>{if(live?.mapId===map?.id)return;const p=window.markerSurfaces?.get(m?.id)||m?.p;if(p&&area&&index!==null&&!contains(p[1]))choose(at(p[1]));};
 const previousFocus=focusMarker;focusMarker=function(id){const m=map?.markers.find(m=>m.id===id);window.revealMarkerLayer(m);previousFocus(id);};
 const previousRender=render;render=function(){
  // Pinned layers keep horizontal follow while the camera targets that height.
  const actualFollow=follow;if(pinned&&floor()&&follow){follow=false;target.set(live?.mapId===map.id?live.p[0]:target.x,(floor().low+floor().high)/2,live?.mapId===map.id?live.p[2]:target.z);}
  try{apply();previousRender();const y=playerY(),inMargin=!pinned&&floor()&&y!==null&&y>=floor().low-layerMargin&&y<floor().high+layerMargin;if(!contains(y??target.y)&&!inMargin)mapHidden(arrow,true);project();}finally{follow=actualFollow;}
 };
 // Passage anchors follow terrain slices. The complete navigation line stays
 // visible: gold on the current layer, dashed cyan on the other layers.
 const previousDraw=renderer.render.bind(renderer);
 const clipped=new WeakMap();
 renderer.render=function(...args){
  for(const object of [navigation,passageLines]){if(!object)continue;if(!clipped.has(object)){
   const old=object.material,isRoute=object===navigation;object.material=new THREE.ShaderMaterial({uniforms:{floorBottom:material.uniforms.floorBottom,floorTop:material.uniforms.floorTop,color:{type:'c',value:old.color},opacity:{type:'f',value:old.opacity}},vertexShader:(isRoute?'attribute float lineDistance;varying float d;':'')+'varying float h;void main(){h=position.y;'+(isRoute?'d=lineDistance;':'')+'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:(isRoute?'varying float d;':'')+'varying float h;uniform float floorBottom;uniform float floorTop;uniform vec3 color;uniform float opacity;void main(){bool outside=h<floorBottom||h>=floorTop;'+(isRoute?'if(outside&&mod(d,5.0)>3.5)discard;gl_FragColor=vec4(outside?vec3(.32,.87,.94):color,opacity);':'if(outside)discard;gl_FragColor=vec4(color,opacity);')+'}',transparent:true,depthTest:false,depthWrite:false});old.dispose();clipped.set(object,true);
  }}return previousDraw(...args);
 };
 const previousCommand=window.mapCommand;window.mapCommand=function(cmd){if(cmd==='layer-up')return step(1);if(cmd==='layer-down')return step(-1);const result=previousCommand(cmd);if(cmd==='follow')window.followPlayerLayer();return result;};
 const previousFollow=$('follow').onclick;$('follow').onclick=function(...args){if(pinned)return window.followPlayerLayer();previousFollow.apply(this,args);if(follow)window.followPlayerLayer();};
 const previousReset=resetView;resetView=function(){choose(null);previousReset();};$('reset').onclick=resetView;renderer.domElement.ondblclick=resetView;$('mini-overview').onclick=()=>{resetView();syncMini();};
 const previousLocalize=localize;localize=function(){previousLocalize();ui();buildLinks();};
 $('layer-up').onclick=()=>step(1);$('layer-down').onclick=()=>step(-1);$('layer-select').onchange=()=>browse($('layer-select').value==='all'?null:Number($('layer-select').value));
 $('layer-player').onclick=()=>window.followPlayerLayer();$('layer-links').onclick=()=>{linksOpen=!linksOpen;ui();};
 document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();if(!e.repeat)step(e.key==='ArrowUp'?1:-1);}});
 const previousHelp=$('help-button').onclick;$('help-button').onclick=()=>{previousHelp();const note=document.createElement('p');note.textContent=tr('自動切換到人物所在層，樓層邊界有防抖。方向鍵上下可暫時瀏覽別層，人物換層後自動恢復；點「自動樓層」或開啟「跟隨」立即返回。只列含 NPC 或物品的層，已持有物品仍計入，空層道路併入相鄰層。並非官方樓層編號。導航顯示完整跨層路線，金線為本層、青色虛線為其他層。編號箭頭為路線換層處，可查看另一層；梯子／機關僅標互動位置。bbhost 上方向鍵同時仍會傳給遊戲，請在安全位置瀏覽。','Layers follow the player automatically with a small boundary margin. D-pad up/down temporarily browses other layers; tracking resumes when the player changes layer. Auto layer or enabling Follow returns immediately. Only layers with NPCs or items are listed, including collected items. Empty roads join nearby layers. These are not official floor numbers. The entire route stays visible: gold on this layer, dashed cyan on others. Numbered arrows mark route crossings; ladders/devices only mark interactions. In bbhost the D-pad also reaches the game; browse in a safe spot.');$('help').insertBefore(note,$('help-close'));};
 dataPromise.then(()=>{if(window.mapReady)load();});
})();
