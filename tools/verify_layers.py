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
assert len(build(fixture,ramp)['floors'])>1 and not build(fixture,ramp)['links'], 'A ramp crossing a slice is not a separate entrance'
for area in maps:
 entry=dataset['maps'][area['id']]
 assert len({l['id'] for l in entry['links']})==len(entry['links'])
 for link in entry['links']:
  assert link['kind']!='road' and link['to'] is None
  marker=next(m for m in area['markers'] if m['id']==link['marker'])
  assert link['p']==marker['p']

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
  # Arbitrary slice intersections must no longer claim to be entrances.
  assert page.locator('.layer-link-marker[data-kind="road"]').count()==0
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
  assert page.locator('.layer-link-marker[data-kind="road"]').count()==0
  page.set_viewport_size({'width':1180,'height':800});page.wait_for_timeout(300)
  page.screenshot(path=str(OUT/'layers-full.png'))
  assert page.locator('#layer-player').inner_text()=='Auto layer'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert sum(u.endswith('/layers.json') for u in requests)==1
  assert not errors,errors
  browser.close()
finally:server.shutdown()
report={'maps':len(results),'originalLayers':sum(x['sourceFloorCount'] for x in results),'contentLayers':sum(x['floorCount'] for x in results),'onlyNpcAndItemLayers':'passed','emptyRoadsRemainContinuous':'passed','collectedAndCategoryFiltersPreserved':'passed','fakeSliceEntrancesRemoved':True,'eventsWithUnknownDestination':sum(l['to'] is None for a in dataset['maps'].values() for l in a['links']),'fixtures':'passed','boundsAndClipping':'passed','automaticPlayerLayer':auto_checks,'misleadingSliceCrossingsRemoved':'passed','compactAndFull':'passed','singleDataFetch':True,'errors':errors}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
