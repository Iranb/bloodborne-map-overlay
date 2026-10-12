import functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts').mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True,args=['--use-angle=default'])
  context=browser.new_context(viewport={'width':1180,'height':760},accept_downloads=True,locale='zh-TW')
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
  page.wait_for_function('window.mapReady===true',timeout=30000)
  # NPCs are visible by default, searchable, focusable, and independently filtered.
  npc_filter=page.locator('#filters [data-kind="npc"]')
  assert npc_filter.get_attribute('aria-pressed')=='true'
  page.locator('#search').fill('Gilbert')
  assert page.locator('.row').count()==1
  page.locator('.row button').click()
  assert '吉爾伯特' in page.locator('#details').inner_text()
  npc_filter.click();assert page.locator('.row').count()==0
  npc_filter.click();assert page.locator('.row').count()==1
  page.locator('.row input').check()
  page.reload();page.wait_for_function('window.mapReady===true')
  page.locator('#search').fill('Gilbert')
  assert page.locator('.row input').is_checked()
  page.locator('.row input').uncheck();page.locator('#search').fill('')
  # Valtr was introduced in the _01 patch map; base _00 alone misses him.
  page.select_option('#map','m27_00_00_00');page.wait_for_function('document.getElementById("loading").hidden')
  page.locator('#search').fill('Valtr');assert page.locator('.row').count()==1
  page.locator('#search').fill('')
  page.select_option('#map','m24_00_00_00');page.wait_for_function('document.getElementById("loading").hidden')
  page.locator('#search').fill('Adella');assert page.locator('.row').count()==1
  page.locator('#search').fill('')
  page.select_option('#map','m24_01_00_00');page.wait_for_function('document.getElementById("loading").hidden')
  page.screenshot(path=str(ROOT/'artifacts/central-yharnam.png'))
  names=page.locator('#map option').evaluate_all('(opts)=>opts.map(o=>({id:o.value,name:o.textContent}))')
  for m in names:
   page.select_option('#map',m['id']);page.wait_for_function('document.getElementById("loading").hidden',timeout=20000)
   result=page.evaluate('({id:map.id,triangles:mesh.geometry.attributes.position.count/3,markers:map.markers.length,bounds:[bounds.min.toArray(),bounds.max.toArray()]})')
   assert result['triangles']>0;results.append(result)
  page.select_option('#map','m24_01_00_00');page.wait_for_function('document.getElementById("loading").hidden')
  first=page.locator('.row input').first;first.check();assert page.locator('#done').inner_text()=='1'
  page.reload();page.wait_for_function('window.mapReady===true');assert page.locator('#done').inner_text()=='1'
  page.select_option('#profile','hunter2');assert page.locator('#done').inner_text()=='0'
  page.select_option('#profile','hunter1');assert page.locator('#done').inner_text()=='1'
  page.locator('.row button').first.click();assert page.locator('#details').is_visible()
  page.locator('#slice').click();assert page.locator('#height').is_visible()
  page.locator('#search').fill('鋸矛');assert page.locator('.row').count()==1
  page.locator('#search').fill('');page.locator('#wire').click();page.locator('#top').click()
  with page.expect_download() as download:page.locator('#export').click()
  exported=json.loads(Path(download.value.path()).read_text('utf-8'));assert exported['profiles']['hunter1']
  page.on('dialog',lambda d:d.accept())
  assert page.evaluate('(data)=>window.importRecords(data)',exported)
  assert not page.evaluate('window.importRecords({version:1,profiles:{hunter1:{unknown:true}}})')
  page.locator('#slice').click();page.locator('#wire').click();page.locator('#reset').click()
  page.locator('.row input').first.uncheck();page.locator('#detail-close').click()
  page.wait_for_timeout(2900)
  page.set_viewport_size({'width':720,'height':465});page.screenshot(path=str(ROOT/'artifacts/compact.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.set_viewport_size({'width':1180,'height':760});page.screenshot(path=str(ROOT/'artifacts/central-yharnam.png'))
  assert not errors,errors
  (ROOT/'artifacts/verification.json').write_text(json.dumps({'maps':results,'errors':errors,'tests':['NPC default visibility, search, focus, filter and persistence','patch-map Valtr placement','duplicate Adella states merged','16 map loads','progress reload','profile isolation','marker focus','height slicing','search','wireframe','top view','export','validated import','invalid import rejection','compact layout']},ensure_ascii=False,indent=2),'utf-8')
  browser.close()
 print('PASS: 16 maps, progress persistence, profiles, filters, import/export, compact layout')
finally:server.shutdown()
