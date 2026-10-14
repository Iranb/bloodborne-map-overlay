"""Browser regression for inventory snapshots; never starts the game."""
import functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True,args=['--use-angle=swiftshader'])
  page=browser.new_page(viewport={'width':1500,'height':900});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  url=f'http://127.0.0.1:{server.server_port}'
  page.goto(url);page.wait_for_function('window.mapReady && Object.keys(inventoryCatalog).length>0')
  page.evaluate("english=true;localize();refresh();$('inventory').click()")
  assert 'No inventory snapshot' in page.locator('#inventory-snapshot').inner_text()
  page.locator('#inventory-close').click()
  fixture=page.evaluate("""()=>{const m=map.markers.find(x=>x.kind==='weapon'&&x.ownership?.length===1);return {marker:m.id,key:m.ownership[0],position:{pid:1,name:'inventory-test',level:30,mapId:map.id,p:m.p,yaw:0,cameraYaw:0}};}""")
  snapshot={'schemaVersion':2,'name':'inventory-test','slot':'userdata0001','saveSet':'test-set','savedAt':'2026-01-02T03:04:05Z','items':[fixture['key'],'4:1000','0:5000000'],'runes':[],'bosses':[],'inventory':[{'key':fixture['key'],'bag':1,'storage':0},{'key':'4:1000','bag':20,'storage':80},{'key':'0:5000000','bag':1,'storage':0}]}
  snapshot['pid']=1
  # Host messages can arrive before the batched position commit. Keep them until the matching host is confirmed.
  page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert page.evaluate('autoState()') is None
  page.evaluate('(position)=>receivePosition({position})',fixture['position'])
  assert page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  # Normal selection must not change automatic progress or write a false manual override.
  page.evaluate('(id)=>focusMarker(id)',fixture['marker'])
  assert page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  assert not page.evaluate('(id)=>Object.hasOwn(records(),id)',fixture['marker'])
  assert 'Bag 1 · Storage 0' in page.locator('#details').inner_text()
  page.evaluate('(id)=>setDone(id,false)',fixture['marker']);page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert not page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  assert 'Manual: incomplete' in page.locator('#details').inner_text()
  assert 'Bag 1 · Storage 0' in page.locator('#details').inner_text()
  page.locator('#detail-auto').click()
  assert page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  # Counts replace, rather than union with, previous holdings. Completion history remains.
  snapshot['inventory'][0].update(bag=0,storage=1)
  snapshot['inventory'][1].update(bag=19,storage=81)
  page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert 'Bag 0 · Storage 1' in page.locator('#details').inner_text()
  assert page.evaluate('stock().get("4:1000").bag')==19
  page.once('dialog',lambda dialog:dialog.accept())
  assert page.evaluate('importRecords({version:1,profiles:saved.profiles,autoRecords})')
  assert page.evaluate('stock().get("4:1000").bag')==19
  snapshot['inventory']=snapshot['inventory'][1:]
  snapshot['items']=snapshot['items'][1:]
  page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert 'Bag 0 · Storage 0' in page.locator('#details').inner_text()
  assert 'Previously owned' in page.locator('#details').inner_text()
  sources=page.evaluate("database.maps.flatMap(x=>x.markers).filter(m=>m.kind==='item'&&m.ownership?.includes('4:1000')).map(m=>({done:completed(m),stock:stockSummary(m)}))")
  assert len(sources)>1 and all(not x['done'] and 'Bag 19' in x['stock'] for x in sources)
  page.locator('#inventory').click()
  assert page.locator('#inventory-rows tr[data-key="0:5000000"]').count()==1
  assert 'Hunter Axe' in page.locator('#inventory-rows').inner_text()
  assert not page.evaluate("database.maps.flatMap(x=>x.markers).some(m=>m.ownership?.includes('0:5000000'))")
  assert not page.evaluate("/[\\u4e00-\\u9fff]/.test(document.querySelector('#inventory-dialog').innerText)")
  page.locator('#inventory-search').fill('1000')
  assert page.locator('#inventory-rows tr').count()==1
  page.locator('#inventory-search').fill('')
  for width,height in [(620,460),(413,293)]:
   page.set_viewport_size({'width':width,'height':height});page.evaluate('setCompactView(true)')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#inventory-dialog').bounding_box()['height']<=height
  page.screenshot(path=str(ROOT/'artifacts/inventory-compact.png'))
  page.evaluate("receivePosition({position:null,statusEn:'Waiting for game'})")
  assert 'Offline save snapshot' in page.locator('#inventory-snapshot').inner_text()
  page.locator('#inventory-close').click();page.reload();page.wait_for_function('window.mapReady')
  page.evaluate("english=true;localize();$('mini-inventory').click()")
  assert page.evaluate('stock().get("4:1000").bag')==19
  assert 'Offline save snapshot' in page.locator('#inventory-snapshot').inner_text()
  page.locator('#inventory-close').click()
  # A new host, including the same character name, waits for its confirmed slot.
  fixture['position']['pid']=2
  page.evaluate('(position)=>receivePosition({position})',fixture['position'])
  assert page.evaluate('autoState()') is None
  second={**snapshot,'pid':2,'slot':'userdata0002','inventory':[],'items':[]}
  page.evaluate('(p)=>receiveProgress(p)',second)
  assert not page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  assert page.evaluate('stock().size')==0
  page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert page.evaluate('activeAutoKey.slot')=='userdata0002'
  snapshot['pid']=2
  page.evaluate('(p)=>receiveProgress({...p,name:"wrong-name"})',snapshot)
  assert page.evaluate('activeAutoKey.slot')=='userdata0002'
  # Auto progress is a visibility preference; inventory counts still refresh.
  page.evaluate('autoProgress=false');page.evaluate('(p)=>receiveProgress(p)',snapshot)
  assert page.evaluate('stock().get("4:1000").bag')==19
  assert not page.evaluate('(id)=>completed(map.markers.find(m=>m.id===id))',fixture['marker'])
  # Legacy payloads have no trustworthy quantities: show unknown, not false zeros.
  legacy={k:v for k,v in snapshot.items() if k not in ('schemaVersion','inventory','saveSet')}
  page.evaluate('(p)=>receiveProgress(p)',legacy)
  assert page.evaluate('stock()') is None
  # Missing private FMG names still show verified quantities with an ID fallback.
  page.route('**/data/inventory-catalog.json',lambda route:route.fulfill(status=404,body=''))
  page.reload();page.wait_for_function('window.mapReady')
  page.evaluate('(p)=>receiveProgress({...p,offline:true})',snapshot)
  page.evaluate("english=true;localize();$('mini-inventory').click()")
  assert 'Item ID 4:1000' in page.locator('#inventory-rows').inner_text()
  assert page.locator('#inventory-rows tr[data-key="4:1000"]').inner_text().split()[-2:]==['19','81']
  assert not errors,errors
  browser.close()
 print('PASS: selection, manual overrides, replacement quantities, storage, consumable sources, shop items, English, compact UI, offline cache and slot isolation')
finally:server.shutdown()
