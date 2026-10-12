"""Language switching, quest translations and missing-data guidance in Edge."""
import functools, http.server, json, re, threading, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'artifacts/english'
OUT.mkdir(parents=True,exist_ok=True)
quests=json.loads((ROOT/'web/data/quests.json').read_text('utf-8'))['quests']
for q in quests:
 assert q['warningEn'] and q['rewardEn'] and all(s['textEn'] for s in q['steps'])
 assert not re.search(r'[\u3400-\u9fff]',q['warningEn']+q['rewardEn']+' '.join(s['textEn'] for s in q['steps']))
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':1180,'height':800},locale='zh-CN')
  errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url))
  page.goto(f'http://127.0.0.1:{server.server_port}')
  page.wait_for_function('window.mapReady && window.layerState?.ready')
  before=page.evaluate('JSON.stringify(saved.profiles)')
  page.locator('#language').click()
  assert page.locator('html').get_attribute('lang')=='en'
  assert 'Exploration Map' in page.title()
  assert page.locator('#map').get_attribute('aria-label')=='Choose area'
  page.locator('#quests').click();page.wait_for_selector('.quest-card')
  assert page.locator('.quest-card').count()==19
  page.locator('#quest-search').fill('Brain Fluid')
  assert page.locator('[data-quest="adeline"]').count()==1
  page.locator('.quest-close').click()
  for q in quests:
   page.evaluate('(id)=>openQuestGuide(id)',q['id'])
   page.wait_for_function('(t)=>document.querySelector("#quest-guide h2")?.textContent===t',arg=q['en'])
   assert not re.search(r'[\u3400-\u9fff]',page.locator('.quest-body').inner_text()),q['id']
   assert page.locator('.quest-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),q['id']
   if q['id']=='adeline':page.screenshot(path=str(OUT/'quest-english.png'))
   page.locator('.quest-close').click()
  for area in page.evaluate('database.maps.map(m=>m.id)'):
   page.evaluate('(id)=>loadMap(id)',area)
   assert not re.search(r'[\u3400-\u9fff]',page.locator('#list').inner_text()),area
   assert not re.search(r'[\u3400-\u9fff]',page.locator('#map').inner_text()),area
  page.evaluate("()=>loadMap('m24_01_00_00')")
  page.screenshot(path=str(OUT/'map-english.png'))
  page.evaluate('setCompactView(true)');page.set_viewport_size({'width':620,'height':460})
  assert page.locator('#mini-zoom-in').get_attribute('title')=='Zoom in'
  page.locator('#mini-quests').click();page.wait_for_selector('.quest-card')
  page.locator('[data-quest="eileen"]').click()
  page.screenshot(path=str(OUT/'compact-english.png'))
  assert page.locator('.quest-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  page.locator('.quest-close').click()
  page.evaluate("()=>{setCompactView(false);receivePosition({position:null,status:'等待角色載入',statusEn:'Waiting for character to load'});}")
  page.wait_for_function("document.getElementById('live-status').textContent==='Waiting for character to load'")
  page.set_viewport_size({'width':1180,'height':800})
  page.locator('#language').click()
  assert page.locator('#live-status').inner_text()=='等待角色載入'
  assert page.evaluate('JSON.stringify(saved.profiles)')==before
  page.locator('#language').click();page.reload();page.wait_for_function('window.mapReady')
  assert page.locator('html').get_attribute('lang')=='en'
  assert sum(u.endswith('/quests.json') for u in requests)==1
  page.route('**/data/maps.json',lambda route:route.fulfill(status=404,body='Missing data'))
  page.reload();page.wait_for_function("document.getElementById('loading').textContent.includes('README')")
  assert 'Initialization failed' in page.locator('#loading').inner_text()
  assert not errors,errors
  browser.close()
finally:server.shutdown()
result={'englishQuests':len(quests),'englishSteps':sum(len(q['steps']) for q in quests),'mapsChecked':16,'languagePersistence':'passed','compactLayout':'passed','readOnlyProgressPreserved':True,'missingDataGuidance':'passed','errors':errors}
(OUT/'verification.json').write_text(json.dumps(result,indent=2)+'\n','utf-8')
print(json.dumps(result))
