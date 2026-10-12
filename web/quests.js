'use strict';
// Static quest notes: one lazy fetch, no polling or extra game/save reads.
(()=>{
 let catalogPromise=null,catalog=null,activeId=null,returnView=null;
 const dialog=document.createElement('dialog');dialog.id='quest-guide';dialog.setAttribute('aria-label','支線與人物事件');document.body.append(dialog);
 const back=document.createElement('button');back.id='quest-return';back.hidden=true;view.append(back);
 const main=document.createElement('button');main.id='quests';document.querySelector('nav').insertBefore(main,$('panel-button'));
 const mini=miniButton('mini-quests','支線',()=>open());miniBar.insertBefore(mini,miniState);main.onclick=()=>open();
 function ui(){dialog.setAttribute('aria-label',tr('支線與人物事件','NPC quest guides'));main.textContent=mini.textContent=tr('支線','Quests');main.title=mini.title=tr('支線人物、條件與流程（含劇透）','NPC quest guides (spoilers)');back.textContent=tr('返回原地圖／跟隨','Return to previous view');}
 ui();const localizeBeforeQuests=localize;localize=function(){localizeBeforeQuests();ui();if(dialog.open&&catalog)draw(activeId);};
 async function getCatalog(){if(!catalogPromise)catalogPromise=fetch('data/quests.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(d=>{catalog=d.quests;return catalog;}).catch(e=>{catalogPromise=null;throw e;});return catalogPromise;}
 const anchor=entity=>{for(const area of database.maps){const marker=area.markers.find(m=>m.kind==='npc'&&(m.entity===entity||m.entities?.includes(entity)));if(marker?.p)return{area,marker};}return null;};
 async function open(id=null){activeId=id;if(!dialog.open)dialog.showModal();dialog.innerHTML=`<p>${tr('正在讀取支線…','Loading quests…')}</p><button class="quest-close">${tr('關閉','Close')}</button>`;dialog.querySelector('.quest-close').onclick=()=>dialog.close();try{await getCatalog();if(dialog.open)draw(activeId);}catch(e){if(dialog.open){dialog.innerHTML=`<p>${tr('無法讀取支線資料，請關閉後重試。','Could not load guides. Close and retry.')}</p><button class="quest-close">${tr('關閉','Close')}</button>`;dialog.querySelector('button').onclick=()=>dialog.close();}}}
 window.openQuestGuide=open;
 function draw(id){
  activeId=id;const q=catalog.find(q=>q.id===id);
  dialog.innerHTML=`<div class="quest-head"><button class="quest-back" ${q?'':'hidden'}>${tr('← 全部支線','← All quests')}</button><strong>${tr('支線與人物事件','NPC quest guides')}</strong><button class="quest-close" aria-label="${tr('關閉支線','Close quests')}">✕</button></div><div class="quest-body"></div>`;
  dialog.querySelector('.quest-close').onclick=()=>dialog.close();dialog.querySelector('.quest-back').onclick=()=>draw(null);
  const body=dialog.querySelector('.quest-body');
  const notice=tr('含劇透。Q 是劇情候選位置，不保證人物目前在場；到訪勾選不代表支線完成。','Spoilers. Q marks a possible story location, not live NPC presence. A visit is not quest completion.');
  if(!q){
   body.innerHTML=`<p class="quest-note">${esc(notice)}</p><input id="quest-search" type="search" aria-label="${tr('搜尋支線','Search quests')}" placeholder="${tr('搜尋人物、獎勵或流程','Search NPC, reward or guide')}"><label class="quest-area"><input id="quest-area" type="checkbox"> ${tr('只看目前地圖相關人物','Only characters in this area')}</label><div class="quest-catalog"></div>`;
   const search=body.querySelector('#quest-search'),area=body.querySelector('#quest-area'),list=body.querySelector('.quest-catalog');
   const fill=()=>{const term=search.value.toLocaleLowerCase();const choices=catalog.filter(q=>(!area.checked||map?.markers.some(m=>m.questId===q.id))&&[q.title,q.en,q.warning,q.warningEn,q.reward,q.rewardEn,...q.steps.flatMap(s=>[s.text,s.textEn])].join(' ').toLocaleLowerCase().includes(term));list.innerHTML=choices.map(q=>`<button class="quest-card" data-quest="${esc(q.id)}"><b>${esc(english?q.en:q.title)}</b><small>${q.dlc?'DLC · ':''}${q.steps.length} ${tr('步驟','steps')} · ${esc(english?q.rewardEn:q.reward)}</small></button>`).join('')||`<p>${tr('沒有符合的支線','No matching quests')}</p>`;for(const b of list.children)if(b.dataset.quest)b.onclick=()=>draw(b.dataset.quest);};
   search.oninput=area.onchange=fill;fill();
  }else{
   body.innerHTML=`<h2>${esc(english?q.en:q.title)}</h2><p class="quest-note">${esc(notice)}</p><p class="quest-warning"><b>${tr('注意：','Caution: ')}</b>${esc(english?q.warningEn:q.warning)}</p><ol class="quest-steps">${q.steps.map((s,i)=>{const a=anchor(s.entity);return `<li><p>${esc(english?s.textEn:s.text)}</p>${a?`<button data-step="${i}">${tr('地圖定位','Show location')} · ${esc(english?a.area.en:a.area.name)}</button>`:`<small>${tr('此步驟請依文字前往，未新增猜測座標。','Follow the directions; no speculative marker.')}</small>`}</li>`;}).join('')}</ol><p class="quest-reward"><b>${tr('主要獎勵：','Rewards: ')}</b>${esc(english?q.rewardEn:q.reward)}</p><details class="quest-sources"><summary>${tr('攻略參考來源','Guide sources')}</summary>${q.sources.map((s,i)=>`<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(new URL(s).hostname)} · ${i+1}</a>`).join('')}</details>`;
   for(const b of body.querySelectorAll('[data-step]'))b.onclick=()=>jump(q.steps[Number(b.dataset.step)].entity);
  }
  body.scrollTop=0;
 }
 async function jump(entity){
  const a=anchor(entity);if(!a)return;
  if(!returnView)returnView={mapId:map.id,follow,autoMap,target:target.toArray(),distance,selected,cut,height:$('height').value,layer:window.layerState?{index:window.layerState.index,pinned:window.layerState.pinned}:null,enabled:[...enabled],hideDone:$('hide-done').checked,search:$('search').value};
  follow=false;autoMap=false;oldToggle();clearRoute();dialog.close();
  if(map.id!==a.area.id)await loadMap(a.area.id);
  enabled.add('npc');$('hide-done').checked=false;$('search').value='';
  for(const b of $('filters').children){b.classList.toggle('active',enabled.has(b.dataset.kind));b.setAttribute('aria-pressed',enabled.has(b.dataset.kind));}
  // Base focus does not route, unmark a visited NPC, or mutate progress.
  originalFocus(a.marker.id);back.hidden=false;syncMini();invalidate();
  // loadMap calls the preference-saving wrapper: temporary browsing must not
  // become a permanent loss of automatic area selection across restarts.
  const pref=JSON.parse(localStorage.getItem(preferenceKey)||'{}');pref.follow=returnView.follow;pref.autoMap=returnView.autoMap;localStorage.setItem(preferenceKey,JSON.stringify(pref));
 }
 back.onclick=async()=>{
  const before=returnView;if(!before)return;back.disabled=true;
  try{
   follow=false;autoMap=false;const id=before.autoMap&&live&&database.maps.some(m=>m.id===live.mapId)?live.mapId:before.mapId;
   if(map.id!==id)await loadMap(id);
   enabled=new Set(before.enabled);$('hide-done').checked=before.hideDone;$('search').value=before.search;
   for(const b of $('filters').children){b.classList.toggle('active',enabled.has(b.dataset.kind));b.setAttribute('aria-pressed',enabled.has(b.dataset.kind));}
   selected=map.markers.some(m=>m.id===before.selected)?before.selected:null;
   if(id===before.mapId){window.restoreMapLayer?.(before.layer);target.set(...before.target);distance=before.distance;cut=before.cut;$('height').value=before.height;applySlice();}
   follow=before.follow;autoMap=before.autoMap;toggleUI();returnView=null;back.hidden=true;refresh();invalidate();
  }finally{back.disabled=false;}
 };
 // Keep modal keyboard actions out of the map's Space/Enter shortcuts.
 dialog.addEventListener('keydown',e=>e.stopPropagation());
})();
