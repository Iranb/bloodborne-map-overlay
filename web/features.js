'use strict';
// Shared controls and persistent settings, with game-specific evidence labels.
const preferenceKey='bloodborne-map-settings-v1';
try{const p=JSON.parse(localStorage.getItem(preferenceKey)||'{}');for(const k of ['follow','viewFollow','autoMap','autoCut','autoProgress'])if(typeof p[k]!=='boolean')delete p[k];if('follow'in p)follow=p.follow;if('viewFollow'in p)viewFollow=p.viewFollow;if('autoMap'in p)autoMap=p.autoMap;if('autoCut'in p)autoCut=p.autoCut;if('autoProgress'in p)autoProgress=p.autoProgress;}catch{}
english=(localStorage.getItem('bloodborne-language')||(!navigator.language.toLowerCase().startsWith('zh')?'en':'zh'))==='en';
const oldToggle=toggleUI;toggleUI=function(){oldToggle();localStorage.setItem(preferenceKey,JSON.stringify({follow,viewFollow,autoMap,autoCut,autoProgress}));};
let avoidance=null,avoidanceStamp=0,avoidanceMap='';
window.resolveMapCamera=function(position,look){
 if(!live||!follow||!viewFollow||live.mapId!==map?.id||!mesh)return;
 if(Date.now()-avoidanceStamp>700||avoidanceMap!==map.id){
  avoidanceStamp=Date.now();avoidanceMap=map.id;
  const clear=p=>{const delta=p.clone().sub(look),len=delta.length();const hit=window.mapRaycast(look,delta.normalize(),.4,len,material.uniforms.cutY.value);return hit?hit.distance:len;};
  const wanted=position.clone(),length=wanted.distanceTo(look);let best=wanted,reach=clear(wanted);avoidance=null;
  if(reach<length-1){
   const offset=wanted.clone().sub(look);
   for(const turn of [0,Math.PI/2,-Math.PI/2,Math.PI]){const p=offset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),turn);p.y=Math.max(p.y,length*.9);p.add(look);const free=clear(p);if(free>reach){reach=free;best=p;}if(free>=p.distanceTo(look)-1)break;}
   if(reach<best.distanceTo(look)-1)best.sub(look).normalize().multiplyScalar(Math.max(.5,reach-.35)).add(look);
   avoidance=best.clone().sub(look);
  }
  $('view-follow').classList.toggle('avoiding',!!avoidance);
 }
 if(avoidance)position.copy(look).add(avoidance);
};

button('recommend','下一目標','Next objective',()=>recommend());
let recommended=false;
function recommend(){
 if(!live||live.mapId!==map?.id){notify(tr('需先取得目前區域的定位','Player position is required in this area'));return;}
 const choices=map.markers.filter(m=>m.p&&!completed(m)&&['lamp','boss','key','tool','weapon'].includes(m.kind));
 choices.sort((a,b)=>{const score=m=>Math.hypot(...m.p.map((v,i)=>v-live.p[i]))+({lamp:0,key:15,tool:15,weapon:25,boss:60}[m.kind]||0);return score(a)-score(b);});
 if(!choices.length){notify(tr('目前區域的建議目標已完成；可切換下一區域','Suggested objectives complete; select the next area'));return;}
 recommended=true;selected=choices[0].id;navigate(selected);refresh();
}
function guidance(){
 const points=window.routePoints;if(!live||!points?.length||!routeTarget||map?.id!==live.mapId)return;
 let best=Infinity,remaining=0,tail=0;
 for(let i=points.length-2;i>=0;i--){const a=points[i],b=points[i+1],d=b.map((v,j)=>v-a[j]),sq=d.reduce((s,v)=>s+v*v,0),t=sq?Math.max(0,Math.min(1,d.reduce((s,v,j)=>s+v*(live.p[j]-a[j]),0)/sq)):0,q=a.map((v,j)=>v+d[j]*t),gap=Math.hypot(...q.map((v,j)=>v-live.p[j])),length=Math.sqrt(sq);if(gap<best){best=gap;remaining=tail+(1-t)*length;}tail+=length;}
 const m=map.markers.find(x=>x.id===routeTarget);if(!m)return;
 routeStatus.textContent=`${english?(m.en||m.kind):m.name} · ${tr('沿路剩餘','Route remaining')} ${remaining.toFixed(0)} m · ${tr('偏離路線','Off route')} ${Number.isFinite(best)?best.toFixed(1):'0'} m`;
}
const receiveLive=window.receivePosition;
window.receivePosition=async function(p){await receiveLive(p);guidance();if(!live&&routeTarget){window.routePoints=null;clearRoute();}};
const priorRefresh=refresh;refresh=function(){const targetWas=routeTarget;priorRefresh();if(recommended&&targetWas&&!routeTarget)recommend();localizeDynamic();};

// Character names can repeat: keep automatic records by confirmed save slot.
let activeAutoKey=null;
const priorAutoState=autoState;autoState=function(){if(!live)return null;if(activeAutoKey?.name===live.name)return autoRecords[activeAutoKey.key]||(autoRecords[activeAutoKey.key]={done:{},observed:[]});return priorAutoState();};
const receiveSaved=window.receiveProgress;window.receiveProgress=function(p){
 if(!live||p.name!==live.name)return;
 const slotChanged=activeAutoKey?.key!==p.slot+'|'+p.name;activeAutoKey={name:p.name,key:p.slot+'|'+p.name};
 if(!autoRecords[activeAutoKey.key])autoRecords[activeAutoKey.key]={done:{},observed:[]};
 receiveSaved(p);if(slotChanged)refresh();
};

const kindEn={lamp:'Lamps',boss:'Boss',npc:'NPC',weapon:'Weapons',armor:'Attire',rune:'Runes',key:'Key items',gem:'Gems',item:'Items',tool:'Hunter tools',passage:'Passages'};
const notesEn={lamp:'Lamp position. Availability depends on bosses and story conditions. Check manually when lit.',boss:'Initial boss position. Defeat is detected from completed autosave snapshots.',npc:'Story candidate position. Proximity records a visit, not a completed conversation or quest.',weapon:'Fixed pickup source. Observed ownership can also come from another source.',armor:'Fixed pickup source. Observed ownership can also come from another source.',rune:'Fixed rune source. Automatically matched against observed rune effects.',key:'Fixed key-item source. Items used before the first scan may require manual correction.',tool:'Hunter tool pickup. Matched against observed inventory IDs.',gem:'Fixed gem source; effects may vary. Mark manually.',item:'Fixed item source. Consumable progress is manual.',passage:'Exact event-object position and orientation. Interact in game; mark discovered manually. The line shows object facing, not a guarantee of an open route.'};
function label(m){return english?(m.en||kindEn[m.kind]+' #'+(m.entity||m.id.split(':').at(-1))):m.name;}
renderDetails=function(){const m=map?.markers.find(x=>x.id===selected);$('details').hidden=!m;if(!m)return;$('details').dataset.kind=m.kind;let evidence='';if(autoState()?.done[m.id]&&!Object.prototype.hasOwnProperty.call(records(),m.id))evidence=m.kind==='npc'?tr('曾接近此位置','Visited vicinity'):m.kind==='boss'?tr('存檔：已擊敗','Autosave: defeated'):tr('已觀測持有','Observed ownership');$('details').innerHTML=`<strong>${esc(label(m))}</strong><p>${esc(english?(m.noteEn||notesEn[m.kind]):m.note)}</p><small>${m.p?'X '+m.p[0].toFixed(1)+' / Y '+m.p[1].toFixed(1)+' / Z '+m.p[2].toFixed(1):tr('未定位','Unlocated')} ${evidence?' · '+evidence:''}</small><div class="detail-actions">${m.questId?`<button id="detail-quest">${tr('支線流程','Quest guide')}</button>`:''}<button id="detail-done">${completed(m)?tr('✓ 已完成 · 取消','✓ Done · undo'):tr('標記為完成','Mark done')}</button><button id="detail-close">${tr('關閉','Close')}</button></div>`;if(m.questId)$('detail-quest').onclick=()=>window.openQuestGuide(m.questId);$('detail-done').onclick=()=>setDone(m.id,!completed(m));$('detail-close').onclick=()=>{selected=null;refresh();};};
const originalLocalize=localize;
localize=function(){originalLocalize();document.documentElement.lang=english?'en':'zh-Hant';const buttons={reset:['全圖','Overview'],top:['俯視','Top'],wire:['線框','Edges'],slice:['切層','Slice'],'panel-button':['清單','List'],'help-button':['說明','Help'],lock:['穿透','Pass'],export:['匯出記錄','Export'],import:['匯入','Import'],clear:['重設','Reset']};for(const [id,t] of Object.entries(buttons))$(id).textContent=t[english?1:0];document.querySelector('.brand small').textContent=tr('獵人的探索筆記',"Hunter's exploration journal");document.querySelector('.profile-row label').textContent=tr('手動記錄','Manual profile');for(const o of $('profile').options)o.textContent=tr('獵人 ','Hunter ')+o.value.at(-1);document.querySelector('.hide-done').lastChild.textContent=tr(' 隱藏已完成',' Hide completed');document.querySelector('footer .hint').textContent=tr('左鍵旋轉 · 右鍵平移 · 滾輪縮放','Drag: orbit · Right drag: pan · Wheel: zoom');for(const b of $('filters').children)b.textContent=english?kindEn[b.dataset.kind]:categories[b.dataset.kind][0];for(const b of bar.querySelectorAll('button'))b.textContent=english?b.dataset.en:b.dataset.zh;localizeDynamic();};
function localizeDynamic(){if(!map)return;$('area-name').textContent=english?map.en:map.name;$('area-en').textContent=english?map.id:map.en;$('total').textContent=tr(' / '+map.markers.length+' 區域目標',' / '+map.markers.length+' area targets');const all=database.maps.flatMap(a=>a.markers);$('global-progress').textContent=tr('全部區域 ','All areas ')+all.filter(completed).length+' / '+all.length;$('status').textContent=map.markers.filter(matches).length+' '+tr('個顯示目標 · 手動＋觀測記錄','visible · manual + observed progress');if(english){for(const row of $('list').children){const m=map.markers.find(m=>m.id===row.dataset.id);if(m){const check=row.querySelector('input');if(check)check.setAttribute('aria-label','Complete '+label(m));}}for(const {m,node}of markerNodes){node.title=label(m);node.setAttribute('aria-label',label(m));}const empty=$('list').querySelector('.empty');if(empty)empty.textContent='No matching targets';}renderDetails();}
$('help-button').onclick=()=>{$('help').innerHTML=english?`<h2>Bloodborne Map</h2><p>Live read-only player tracking, automatic area selection, facing and camera direction, collision routes and roof cutaway.</p><p>Click an incomplete marker for a route. Shift-click or Space overrides progress. Reset selects the whole map. Next objective prioritizes nearby lamps and pickups before bosses; the area selector follows a suggested exploration order.</p><p>Autosave snapshots recognize weapons, attire, runes, hunter tools, key items and defeated bosses. NPC proximity means visited, not quest completion. Lamps and passages need manual confirmation. Manual profiles remain separate from automatic save-slot records.</p><p>Ctrl+Alt (or Ctrl+Shift) + M: show; F: fullscreen/compact; L: passthrough; R: restore; G: gamepad mode. Controller mute or View+Menu toggles map mode; B exits. Input isolation needs the updated game host.</p><p>Left stick rotates; right stick pans; triggers zoom; shoulders switch area; A follows; X routes; Y layers; L3 camera view; R3 overview. Touchpad expands. The game continues running.</p><p>16 base/DLC areas. Procedural chalices are not included. Static terrain does not know door, elevator or one-way states. Missing/unconnected geometry produces no invented route.</p><button id="help-close">Explore</button>`:`<h2>Bloodborne 探索地圖</h2><p>唯讀人物定位、自動切圖、人物與鏡頭朝向、碰撞地形尋路、遮擋避讓和切屋頂。</p><p>點擊未完成目標導航；Shift 點擊或空白鍵手動修正進度。全圖取消跟隨。下一目標優先推薦附近燈籠與收集品，再推薦 Boss；區域選單按建議探索順序排列。</p><p>存檔快照辨識武器、服裝、符文、獵人工具、重要道具和 Boss。NPC 自動記錄的是曾接近，不代表完成交談。燈籠和通道需手動確認。自動記錄按角色存檔槽隔離；三份手動記錄獨立保存。</p><p>Ctrl+Alt（或 Ctrl+Shift）+ M 顯示、F 大小窗、L 穿透、R 還原、G 手柄模式。手柄靜音鍵或 View+Menu 進出地圖模式，圈鍵退出。需更新遊戲輸入隔離模組，遊戲不會暫停。</p><p>左搖桿旋轉，右搖桿平移，扳機縮放，肩鍵切圖，叉鍵跟隨，方鍵導航，三角圖層，L3 視向，R3 全圖，觸控板大小窗。</p><p>本體＋DLC 16 區；不含程序金杯。靜態地形不知道門、升降機和單向落差的現況。缺失或不連通地形不會生成猜測路線。</p><button id="help-close">開始探索</button>`;$('help-close').onclick=()=>$('help').close();$('help').showModal();};

// Include observed evidence in backups while retaining compatibility with v1.
const importManual=window.importRecords;
window.importRecords=function(v){let clean={};try{if(v.autoRecords!==undefined){if(!v.autoRecords||typeof v.autoRecords!=='object'||Array.isArray(v.autoRecords))throw Error();for(const [key,s]of Object.entries(v.autoRecords)){if(key==='__proto__'||key==='constructor'||key.length>160||!s||!s.done||!Array.isArray(s.observed)||s.observed.some(x=>typeof x!=='string'||x.length>80))throw Error();const done={};for(const [id,value]of Object.entries(s.done)){if(!allIds.has(id)||typeof value!=='boolean')throw Error();done[id]=value;}clean[key]={done,observed:s.observed};}}}catch{notify(tr('自動進度資料格式無效','Invalid automatic-progress data'));return false;}if(!importManual(v))return false;for(const [k,s]of Object.entries(clean)){const old=autoRecords[k]||{done:{},observed:[]};autoRecords[k]={done:{...old.done,...s.done},observed:[...new Set([...old.observed,...s.observed])]};}saveAuto();refresh();return true;};
$('export').onclick=()=>{const content=JSON.stringify({version:1,profiles:saved.profiles,autoRecords},null,2);if(host('export',{content}))return;const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Bloodborne-exploration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const readyPoll=setInterval(()=>{if(window.mapReady){clearInterval(readyPoll);toggleUI();localize();refresh();}},100);

let passageLines=null;
const refreshWithPassages=refresh;refresh=function(){refreshWithPassages();if(passageLines){scene.remove(passageLines);passageLines.geometry.dispose();passageLines.material.dispose();passageLines=null;}if(!map||!enabled.has('passage'))return;const geo=new THREE.Geometry();for(const m of map.markers.filter(x=>x.kind==='passage'&&x.p&&matches(x))){const yaw=(m.rotation?.[1]||0)*Math.PI/180,dx=Math.sin(yaw)*1.8,dz=Math.cos(yaw)*1.8;geo.vertices.push(new THREE.Vector3(m.p[0]-dx,m.p[1]+.4,m.p[2]-dz),new THREE.Vector3(m.p[0]+dx,m.p[1]+.4,m.p[2]+dz));}passageLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x52dce5,transparent:true,opacity:.8,depthTest:false}));scene.add(passageLines);invalidate();};

window.updateLiveDistances=function(){if(!live||map?.id!==live.mapId||getComputedStyle($('panel')).display==='none')return;const lookup=new Map(map.markers.map(m=>[m.id,m]));for(const row of $('list').children){const m=lookup.get(row.dataset.id);if(!m?.p)continue;const d=Math.hypot(...m.p.map((v,i)=>v-live.p[i])),dy=m.p[1]-live.p[1],s=d.toFixed(1)+' m'+(dy>4?' · '+tr('上層','Above'):dy< -4?' · '+tr('下層','Below'):' · '+tr('附近樓層','Same level'));const el=row.querySelector('small');if(el.textContent!==s)el.textContent=s;}};
window.collisionReady=function(){lastCoverAt=0;avoidanceStamp=0;if(!document.hidden)invalidate();};
