"""Real-asset layer clipping, crossed-road evidence and UI/controller commands."""
import functools, http.server, json, threading, sys
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright
from build_layers import build
from verify_auto_layers import verify_auto_layers

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'artifacts/layers'
OUT.mkdir(parents=True,exist_ok=True)
dataset=json.loads((ROOT/'web/data/layers.json').read_text('utf-8'))
maps=json.loads((ROOT/'web/data/maps.json').read_text('utf-8'))['maps']
fixture={'id':'test','markers':[]}
stacked=np.array([[[0,0,0],[0,0,4],[4,0,0]],[[0,16,0],[0,16,4],[4,16,0]]],dtype=np.float32)
assert not build(fixture,stacked)['links'], 'Stacked disconnected floors cannot become links'
ramp=np.array([[[0,0,0],[0,20,30],[4,0,0]]],dtype=np.float32)
assert build(fixture,ramp)['links'], 'Actual ramp must produce crossings'
evidence=0
for area in maps:
 entry=dataset['maps'][area['id']];tri=np.fromfile(ROOT/'web/data'/area['mesh'],dtype='<f4').reshape(-1,3,3)
 c=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);length=np.linalg.norm(c,axis=1)
 road=tri[(length>1e-8)&(c[:,1]>=length*.58)];lo=road[:,:,1].min(axis=1);hi=road[:,:,1].max(axis=1)
 assert len({l['id'] for l in entry['links']})==len(entry['links'])
 for link in entry['links']:
  if link['kind']!='road':
   marker=next(m for m in area['markers'] if m['id']==link['marker']);assert link['p']==marker['p'] and link['to'] is None
   continue
  y=link['boundary'];assert link['to']==link['from']+1
  assert y==entry['floors'][link['from']]['high']==entry['floors'][link['to']]['low']
  nearby=road[(lo<y-.01)&(hi>y+.01)]
  point=np.array(link['p']);a=nearby[:,0];u=nearby[:,1]-a;v=nearby[:,2]-a;w=point-a
  uu=np.einsum('ij,ij->i',u,u);uv=np.einsum('ij,ij->i',u,v);vv=np.einsum('ij,ij->i',v,v)
  wu=np.einsum('ij,ij->i',w,u);wv=np.einsum('ij,ij->i',w,v);den=uu*vv-uv*uv
  valid=den>1e-8;s=np.zeros_like(den);t=s.copy();s[valid]=(wu[valid]*vv[valid]-wv[valid]*uv[valid])/den[valid];t[valid]=(wv[valid]*uu[valid]-wu[valid]*uv[valid])/den[valid]
  residual=np.linalg.norm(w-s[:,None]*u-t[:,None]*v,axis=1)
  assert np.any(valid&(s>=-.005)&(t>=-.005)&(s+t<=1.005)&(residual<.005)),link
  evidence+=1

class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];requests=[];results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True,args=['--use-angle=swiftshader'])
  page=browser.new_page(viewport={'width':620,'height':460})
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.goto(f'http://127.0.0.1:{server.server_port}/?compact=1')
  page.wait_for_function('window.mapReady&&layerState?.ready&&terrainStats.ready')
  before=page.evaluate('JSON.stringify(saved.profiles)')
  for area in maps:
   page.evaluate('(id)=>loadMap(id)',area['id']);page.wait_for_function('layerState.ready&&terrainStats.ready&&document.getElementById("loading").hidden')
   state=page.evaluate('({...layerState,sourceTriangles:mesh.geometry.attributes.position.count/3})')
   assert state['mapId']==area['id'] and state['floorCount']>=1
   assert state['floorCount']<state['sourceFloorCount']
   assert all(f['npc']+f['items']>0 for f in state['contentFloors'])
   assert page.locator('#layer-select option').count()==state['floorCount']+1
   fs=state['contentFloors'];raw=dataset['maps'][area['id']]['floors']
   assert fs[0]['low']==raw[0]['low'] and fs[-1]['high']==raw[-1]['high']
   assert all(a['high']==b['low'] for a,b in zip(fs,fs[1:]))
   base=max(0,min(1,state['floorCount']-2))
   page.evaluate('(i)=>{selectMapLayer(i);dirty=true;render();}',base)
   assert page.evaluate('material.uniforms.floorBottom.value===layerState.floor.low&&material.uniforms.floorTop.value===layerState.floor.high')
   assert page.evaluate('markerNodes.every(({m,node})=>node.hidden||layerContains(m.p[1]))')
   page.evaluate('()=>{mapCommand("layer-up");mapCommand("layer-down");}')
   assert page.evaluate('layerState.index')==base
   if state['floorCount']>1:assert page.locator('#mini-follow').get_attribute('aria-pressed')=='false'
   page.evaluate('()=>{selectMapLayer(0);mapCommand("layer-down");}')
   assert page.evaluate('layerState.index')==0
   page.evaluate('()=>{selectMapLayer(layerState.floorCount-1);mapCommand("layer-up");}')
   assert page.evaluate('layerState.index===layerState.floorCount-1')
   results.append(state)
  # Structural layers do not vanish when collected targets or categories hide.
  count=page.evaluate('layerState.floorCount')
  page.evaluate('()=>{enabled.clear();document.getElementById("hide-done").checked=true;refresh();}')
  assert page.evaluate('layerState.floorCount')==count
  page.evaluate('()=>{enabled=new Set(Object.keys(categories));document.getElementById("hide-done").checked=false;refresh();}')
  # With no NPC/item targets, no otherwise-empty floor selector is displayed.
  page.evaluate('async()=>{window.layerOriginalMarkers=map.markers;map.markers=map.markers.filter(m=>!new Set(["npc","weapon","armor","rune","key","tool","gem","item"]).has(m.kind));await loadMap(map.id);}')
  assert page.evaluate('layerState.floorCount===0&&layerState.index===null')
  assert not page.locator('#layer-controls').is_visible()
  page.evaluate('async()=>{map.markers=layerOriginalMarkers;await loadMap(map.id);}')
  page.evaluate("()=>loadMap('m24_01_00_00')");page.wait_for_function('layerState.ready&&terrainStats.ready')
  page.evaluate('()=>{selectMapLayer(6);target.set(-150,-50,10);distance=70;phi=.15;theta=0;}')
  page.locator('#layer-links').click();page.wait_for_timeout(250)
  assert page.locator('#layer-connections').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  # Locate an actual crossing and jump to its other layer at the same X/Z.
  first=page.locator('.layer-link-row:has(.layer-jump)').first
  linkid=first.get_attribute('data-id');first.locator('button').first.click()
  start=page.evaluate('({target:target.toArray(),index:layerState.index})')
  page.locator('#layer-link-jump').click()
  end=page.evaluate('({target:target.toArray(),index:layerState.index})')
  assert start['target']==end['target'] and start['index']!=end['index']
  page.wait_for_timeout(3000);page.screenshot(path=str(OUT/'layers-compact.png'))
  assert page.evaluate('JSON.stringify(saved.profiles)')==before
  auto_checks=verify_auto_layers(page)
  # Browser keyboard and native host commands use the same function.
  page.locator('#layer-player').click();page.locator('body').click(position={'x':10,'y':10})
  index=page.evaluate('layerState.index');page.keyboard.press('ArrowUp');assert page.evaluate('layerState.index')==index+1
  # Dialogs must retain arrows for scrolling rather than changing map layers.
  page.evaluate('()=>openQuestGuide("eileen")');page.wait_for_selector('.quest-steps')
  index=page.evaluate('layerState.index');page.evaluate('()=>mapCommand("layer-up")');assert page.evaluate('layerState.index')==index
  page.locator('.quest-close').click()
  page.evaluate('()=>{setCompactView(false);english=true;localize();selectMapLayer(6);}')
  page.locator('.layer-link-row:has(.layer-jump)').first.locator('button').first.click()
  page.set_viewport_size({'width':1180,'height':800});page.wait_for_timeout(300)
  page.screenshot(path=str(OUT/'layers-full.png'))
  assert page.locator('#layer-player').inner_text()=='Auto layer'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert sum(u.endswith('/layers.json') for u in requests)==1
  assert not errors,errors
  browser.close()
finally:server.shutdown()
report={'maps':len(results),'originalLayers':sum(x['sourceFloorCount'] for x in results),'contentLayers':sum(x['floorCount'] for x in results),'onlyNpcAndItemLayers':'passed','emptyRoadsRemainContinuous':'passed','collectedAndCategoryFiltersPreserved':'passed','roadCrossingsEvidenced':evidence,'eventsWithUnknownDestination':sum(l['to'] is None for a in dataset['maps'].values() for l in a['links']),'fixtures':'passed','boundsAndClipping':'passed','automaticPlayerLayer':auto_checks,'crossingJumpAndProgress':'passed','compactAndFull':'passed','singleDataFetch':True,'errors':errors}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
