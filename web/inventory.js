'use strict';
// Current stock is replaced on every stable save, independently of pickup history.
let inventoryCatalog={},inventoryLookup=new Map(),inventoryArray=null;
function stock(){const entries=autoState()?.inventory;if(!Array.isArray(entries))return null;if(entries!==inventoryArray){inventoryArray=entries;inventoryLookup=new Map(entries.map(x=>[x.key,x]));}return inventoryLookup;}
function inventoryName(key){const v=inventoryCatalog[key];return v?(english?v.en||v.name:v.name||v.en):tr('道具編號 ','Item ID ')+key;}
function stockText(v){return tr('背包 ','Bag ')+v.bag+' · '+tr('倉庫 ','Storage ')+v.storage;}
function markerStock(m){const current=stock();if(!current||!m.ownership?.length)return null;return m.ownership.map(key=>current.get(key)||{key,bag:0,storage:0});}
function stockSummary(m){const entries=markerStock(m);if(!entries)return '';if(entries.length===1)return entries[0].bag+entries[0].storage>0?stockText(entries[0]):'';const owned=entries.filter(x=>x.bag+x.storage>0).length;return owned?tr('目前持有 ','Currently held ')+owned+' / '+entries.length+tr(' 種',' types'):'';}
function saveTime(){const value=autoState()?.inventorySavedAt;if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(english?'en-US':'zh-TW'):'';}
const inventoryDialog=document.createElement('dialog');inventoryDialog.id='inventory-dialog';
inventoryDialog.innerHTML='<div class="inventory-head"><strong id="inventory-title"></strong><button id="inventory-refresh"></button><button id="inventory-close"></button></div><div class="inventory-body"><p id="inventory-snapshot"></p><p id="inventory-explanation"></p><input id="inventory-search" type="search"><table><thead id="inventory-headings"></thead><tbody id="inventory-rows"></tbody></table><p id="inventory-empty"></p></div>';
document.body.append(inventoryDialog);
button('inventory','背包／倉庫','Inventory',()=>{renderInventory();inventoryDialog.showModal();});
$('inventory-close').onclick=()=>inventoryDialog.close();
$('inventory-refresh').onclick=()=>{if(!host('inventory-refresh'))notify(tr('請在桌面地圖中重新讀取存檔','Refresh saves in the desktop app'));};
$('inventory-search').oninput=renderInventory;
inventoryDialog.addEventListener('keydown',e=>e.stopPropagation());
function renderInventory(){
 const current=stock(),query=$('inventory-search').value.trim().toLowerCase();
 $('inventory-title').textContent=tr('背包與倉庫','Bag and storage');$('inventory-close').textContent=tr('關閉','Close');$('inventory-refresh').textContent=tr('重新讀取存檔','Refresh save');
 $('inventory-search').placeholder=tr('搜尋持有道具或編號','Search owned items or IDs');$('inventory-search').setAttribute('aria-label',$('inventory-search').placeholder);
 $('inventory-snapshot').textContent=current?`${activeAutoKey.name} · ${activeAutoKey.slot} · ${live?tr('最新完整存檔','Latest completed save'):tr('離線存檔快照','Offline save snapshot')} · ${saveTime()}`:tr('尚無背包快照；請重新讀取存檔。','No inventory snapshot. Refresh the save.');
 $('inventory-explanation').textContent=tr('數量以遊戲保存為準；持有不代表地圖拾取點已完成。','Counts update when the game saves. Ownership does not confirm a map pickup.');
 $('inventory-headings').innerHTML=`<tr><th>${tr('道具','Item')}</th><th>${tr('背包','Bag')}</th><th>${tr('倉庫','Storage')}</th></tr>`;
 const entries=current?[...current.values()].filter(x=>x.bag+x.storage>0&&(inventoryName(x.key).toLowerCase().includes(query)||x.key.includes(query))).sort((a,b)=>inventoryName(a.key).localeCompare(inventoryName(b.key))):[];
 $('inventory-rows').innerHTML=entries.map(x=>`<tr data-key="${esc(x.key)}"><td>${esc(inventoryName(x.key))}<small>${esc(x.key)}</small></td><td>${x.bag}</td><td>${x.storage}</td></tr>`).join('');
 $('inventory-empty').hidden=entries.length>0;$('inventory-empty').textContent=current?tr('沒有符合的持有道具','No matching owned items'):tr('等待可辨識的完整存檔','Waiting for a recognized completed save');
}
const detailsBeforeStock=renderDetails;
renderDetails=function(){
 detailsBeforeStock();const m=map?.markers.find(x=>x.id===selected);if(!m)return;
 const entries=markerStock(m),manual=Object.prototype.hasOwnProperty.call(records(),m.id),actions=$('details').querySelector('.detail-actions');
 if(entries){const info=document.createElement('div');info.className='detail-stock';info.innerHTML=`<small>${esc(tr('存檔數量 · ','Save stock · ')+saveTime())}</small>`+entries.map(x=>`<p>${esc(inventoryName(x.key))} · <b>${esc(stockText(x))}</b></p>`).join('');if(m.kind==='item')info.innerHTML+=`<small>${tr('持有消耗品不會自動勾選所有同名拾取點。','Owning a consumable does not check every source of it.')}</small>`;actions.before(info);}
 if(manual){const b=document.createElement('button');b.id='detail-auto';b.textContent=tr('清除手動覆蓋','Clear manual override');b.title=tr('恢復此標記的自動觀測記錄','Use automatic observations for this marker');b.onclick=()=>{delete records()[m.id];persist();refresh();};actions.prepend(b);const note=document.createElement('small');note.className='manual-evidence';note.textContent=records()[m.id]?tr('手動標記：已完成','Manual: done'):tr('手動標記：未完成','Manual: incomplete');actions.before(note);}
};
const refreshBeforeStock=refresh;
refresh=function(){refreshBeforeStock();if(map)for(const row of $('list').children){const m=map.markers.find(x=>x.id===row.dataset.id),text=m?stockSummary(m):'';if(!text)continue;const badge=document.createElement('span');badge.className='inventory-stock';badge.textContent=text;row.querySelector('button')?.append(badge);}if(inventoryDialog.open)renderInventory();};
const localizeBeforeStock=localize;localize=function(){localizeBeforeStock();if(inventoryDialog.open)renderInventory();};
const positionBeforeStock=window.receivePosition;window.receivePosition=async function(p){const before=activeAutoKey,wasLive=!!live;await positionBeforeStock(p);if(before!==activeAutoKey)refresh();else if(inventoryDialog.open&&wasLive!==!!live)renderInventory();};
fetch('data/inventory-catalog.json').then(r=>{if(!r.ok)return null;return r.json();}).then(v=>{if(v?.version===1&&v.items&&typeof v.items==='object'){inventoryCatalog=v.items;refresh();}}).catch(()=>{});
