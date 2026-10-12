'use strict';
// Small overlay is a map-first view; the full exploration UI remains available.
let miniMap=false,miniPanel=false,miniWasFollow=false;
const miniBar=document.createElement('div');miniBar.id='mini-controls';
function miniButton(id,title,handler){const b=document.createElement('button');b.id=id;b.textContent=title;b.onclick=handler;miniBar.append(b);return b;}
miniButton('mini-follow','跟隨',()=>{$('follow').click();syncMini();});
miniButton('mini-zoom-in','＋',()=>{distance=Math.max(5,distance*.8);invalidate();}).title='放大地圖';
miniButton('mini-zoom-out','－',()=>{distance=Math.min(fullDistance*2,distance/ .8);invalidate();}).title='縮小地圖';
miniButton('mini-route','導航',()=>{$('route').click();syncMini();});
miniButton('mini-list','清單',()=>{miniPanel=!miniPanel;document.body.classList.toggle('mini-list-open',miniPanel);syncMini();resize();});
miniButton('mini-overview','全圖',()=>{resetView();syncMini();});
let runeFilterBefore=null;
miniButton('mini-runes','符文',()=>{
 if(runeFilterBefore){enabled=new Set(runeFilterBefore.enabled);$('hide-done').checked=runeFilterBefore.hideDone;runeFilterBefore=null;}
 else{runeFilterBefore={enabled:[...enabled],hideDone:$('hide-done').checked};enabled=new Set(['rune']);$('hide-done').checked=false;miniPanel=true;document.body.classList.add('mini-list-open');}
 for(const b of $('filters').children){b.classList.toggle('active',enabled.has(b.dataset.kind));mapAttribute(b,'aria-pressed',enabled.has(b.dataset.kind));}
 refresh();resize();if(runeFilterBefore&&!map?.markers.some(m=>m.kind==='rune'))notify(tr('此區域沒有已確認的符文來源，請切換地圖。','No verified rune sources in this area; select another map.'));
}).title='顯示目前區域全部符文，包括已持有；再按一次恢復篩選';
const miniState=document.createElement('span');miniState.id='mini-state';miniBar.append(miniState);document.body.append(miniBar);
function syncMini(){mapText($('mini-runes'),tr('符文','Runes'));mapAttribute($('mini-runes'),'aria-pressed',!!runeFilterBefore);mapText($('mini-follow'),tr('跟隨','Follow'));mapAttribute($('mini-follow'),'aria-pressed',follow);mapText($('mini-route'),tr('導航','Route'));mapAttribute($('mini-route'),'aria-pressed',!!routeTarget);mapText($('mini-list'),miniPanel?tr('收起','Close'):tr('清單','List'));mapAttribute($('mini-list'),'aria-pressed',miniPanel);mapText($('mini-overview'),tr('全圖','All'));mapText(miniState,live?(follow?tr('即時跟隨','Live follow'):tr('自由瀏覽','Free view')):tr('離線瀏覽','Offline'));}
window.setCompactView=function(value){
 const changed=miniMap!==value;miniMap=value;miniPanel=false;
 document.body.classList.toggle('mini-map',value);document.body.classList.remove('mini-list-open');
 if(value){document.body.classList.remove('panel-hidden');if(changed&&follow&&live){distance=Math.max(22,Math.min(distance/1.5,42));miniWasFollow=true;}}
 else if(changed&&miniWasFollow&&follow&&live){distance=Math.min(fullDistance,distance*1.5);miniWasFollow=false;}
 syncMini();resize();
};
const refreshBeforeMini=refresh;refresh=function(){refreshBeforeMini();syncMini();};
const updateBeforeMini=window.receivePosition;window.receivePosition=async function(p){const hadLive=!!live;await updateBeforeMini(p);if(miniMap&&!hadLive&&live&&follow){distance=38;invalidate();}syncMini();};
// Compact distance culling is included in the base projection pass, avoiding
// an unhide/hide pair on every update for distant markers.
$('compact').onclick=()=>{if(!host('compact'))window.setCompactView(!miniMap);};
window.chrome?.webview?.addEventListener('message',e=>{if(e.data.action==='window')window.setCompactView(e.data.compact??!e.data.expanded);});
if(new URLSearchParams(location.search).get('compact')==='1')window.setCompactView(true);
const previousMapCommand=window.mapCommand;window.mapCommand=function(cmd){if(cmd!=='follow')return previousMapCommand(cmd);follow=true;viewFollow=true;distance=miniMap?38:55;toggleUI();syncMini();invalidate();};
