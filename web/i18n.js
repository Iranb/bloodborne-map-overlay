'use strict';
// Native and browser language preferences share the same switch.
const localizeBeforeAccessibility=localize;
localize=function(){
 localizeBeforeAccessibility();
 document.title=tr('Bloodborne · 探索地圖','Bloodborne · Exploration Map');
 const attributes={
  map:['aria-label','選擇區域','Choose area'],
  compact:['title','大窗／小窗 · Ctrl+Alt+F','Fullscreen / compact · Ctrl+Alt+F'],
  lock:['title','鼠標穿透 · Ctrl+Alt+L','Mouse passthrough · Ctrl+Alt+L'],
  hide:['title','隱藏 · Ctrl+Alt+M','Hide · Ctrl+Alt+M'],
  height:['aria-label','切層高度','Slice height'],
  viewport:['aria-label','可旋轉、縮放的三維地圖','Interactive 3D map: orbit and zoom'],
  search:['aria-label','搜尋標記','Search markers'],
  list:['aria-label','探索目標清單','Exploration objectives'],
  'mini-zoom-in':['title','放大地圖','Zoom in'],
  'mini-zoom-out':['title','縮小地圖','Zoom out'],
  'mini-runes':['title','顯示目前區域全部符文，包括已持有；再按一次恢復篩選','Show all rune sources in this area, including owned runes; press again to restore filters'],
 };
 for(const [id,[attribute,zh,en]] of Object.entries(attributes))mapAttribute($(id),attribute,tr(zh,en));
 if(!live)mapText($('live-status'),(english?lastPositionStatus?.statusEn:lastPositionStatus?.status)||tr('等待遊戲 · 可離線瀏覽','Waiting for game · Offline browsing available'));
 if(!map){mapText($('status'),tr('離線探索 · 手動記錄','Offline exploration · Manual records'));mapText($('total'),tr(' / 0 已完成',' / 0 completed'));}
 syncMini();
 host('language',{english});
};
window.chrome?.webview?.addEventListener('message',e=>{
 if(e.data.action!=='language')return;
 const stored=localStorage.getItem('bloodborne-language');
 english=stored?stored==='en':!!e.data.english;
 localize();refresh();
});
localize();
