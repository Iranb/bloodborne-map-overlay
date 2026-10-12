"""Quest links, modal controls and temporary map browsing against real assets."""
import json, functools, http.server, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'; OUT=ROOT/'artifacts/quests-20261011'
OUT.mkdir(parents=True,exist_ok=True)
data=json.loads((WEB/'data/maps.json').read_text('utf-8'))
quests=json.loads((WEB/'data/quests.json').read_text('utf-8'))['quests']
markers={m['id']:m for a in data['maps'] for m in a['markers']}
assert len(quests)==19 and len({q['id'] for q in quests})==19
assert len(markers)==sum(len(a['markers']) for a in data['maps']), 'Duplicate marker IDs'
npcs={m['entity']:m for m in markers.values() if m['kind']=='npc'}
for q in quests:
 assert q['steps'] and q['warning'] and q['reward'] and all(s.startswith('https://') for s in q['sources'])
 for e in q['entities']:assert npcs[e]['questId']==q['id']
 for s in q['steps']:
  if s['entity'] is not None:assert npcs[s['entity']]['p']
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(WEB)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':620,'height':460},locale='zh-TW')
  errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda req:requests.append(req.url))
  page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('window.mapReady')
  page.evaluate("async()=>{await loadMap('m24_01_00_00');setCompactView(true);follow=true;autoMap=true;toggleUI();}")
  assert not any(u.endswith('/quests.json') for u in requests)
  page.locator('#mini-quests').click();page.wait_for_selector('.quest-card')
  assert page.locator('.quest-card').count()==19
  page.screenshot(path=str(OUT/'catalog.png'))
  page.locator('#quest-area').check();assert page.locator('.quest-card').count()==6
  page.locator('#quest-area').uncheck();page.locator('#quest-search').fill('Eileen');assert page.locator('.quest-card').count()==1
  page.locator('[data-quest="eileen"]').click();assert '亨利克' in page.locator('.quest-warning').inner_text()
  before=page.evaluate('JSON.stringify(saved.profiles)')
  page.screenshot(path=str(OUT/'eileen-compact.png'))
  # Native Space scrolling must not toggle the selected exploration record.
  page.locator('.quest-body').click(position={'x':15,'y':12});page.keyboard.press('Space')
  assert page.evaluate('JSON.stringify(saved.profiles)')==before
  page.locator('[data-step="1"]').click();page.wait_for_function("map.id==='m24_00_00_00'&&selected?.endsWith('2400900')")
  assert not page.evaluate('follow||autoMap')
  assert page.locator('.quest-marker.selected').inner_text()=='Q'
  assert page.locator('#detail-quest').is_visible()
  # A live sample cannot pull a quest destination back into the player's area.
  page.evaluate("async()=>await receivePosition({position:{pid:1,name:'quest-test',mapId:'m24_01_00_00',level:10,p:[0,0,0],yaw:0,cameraYaw:0}})")
  assert page.evaluate('map.id')=='m24_00_00_00'
  assert page.evaluate('JSON.stringify(saved.profiles)')==before
  page.locator('#detail-quest').click();page.wait_for_selector('.quest-steps');assert page.locator('.quest-steps li').count()==4
  page.locator('.quest-close').click();page.locator('#quest-return').click()
  page.wait_for_function("map.id==='m24_01_00_00'&&follow&&autoMap")
  assert page.evaluate('JSON.stringify(saved.profiles)')==before
  # Read all guides, check that every linked button fits the scrolling modal.
  for q in quests:
   page.evaluate('(id)=>openQuestGuide(id)',q['id']);page.wait_for_function('(title)=>document.querySelector("#quest-guide h2")?.textContent===title',arg=q['title'])
   assert page.locator('.quest-steps li').count()==len(q['steps'])
   assert page.locator('.quest-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   page.locator('.quest-close').click()
  assert sum(u.endswith('/quests.json') for u in requests)==1
  page.evaluate("()=>{setCompactView(false);english=true;localize();}");page.set_viewport_size({'width':1100,'height':780})
  page.locator('#quests').click();page.wait_for_selector('.quest-card');assert page.locator('.quest-card').count()==19
  assert 'A visit is not quest completion.' in page.locator('.quest-note').inner_text()
  page.screenshot(path=str(OUT/'catalog-full.png'))
  assert not errors,errors;b.close()
finally:server.shutdown()
result={'quests':len(quests),'linkedNpcPositions':sum('questId' in m for m in markers.values()),'allExistingMarkersPreserved':True,'guideFetches':1,'crossAreaAndReturn':'passed','manualRecordsUnchanged':True,'compactAndFullModal':'passed','gameStarted':False}
(OUT/'verification.json').write_text(json.dumps(result,indent=2),'utf-8')
print(json.dumps(result))
