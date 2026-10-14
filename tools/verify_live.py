import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(channel='msedge',headless=True,args=['--use-angle=swiftshader'])
  page=b.new_page(viewport={'width':1500,'height':900});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('window.mapReady===true')
  page.evaluate('english=false;localize();refresh();')
  snapshot=json.loads((ROOT/'artifacts/live-snapshot.json').read_text('utf-8'))
  page.evaluate('(s)=>receivePosition(s)',snapshot)
  page.evaluate('(p)=>receiveProgress(p)',snapshot['progress'])
  page.wait_for_function('mesh && layerState?.ready')
  assert page.evaluate('live.name')=='gg'
  page.wait_for_function('target.distanceTo(new THREE.Vector3(live.p[0],live.p[1]+1,live.p[2]))<.01')
  assert page.evaluate('target.distanceTo(new THREE.Vector3(live.p[0],live.p[1]+1,live.p[2]))')<.01
  assert page.locator('#player-arrow').is_visible()
  assert page.evaluate('autoState().slot')=='userdata0001'
  assert page.evaluate('database.maps.flatMap(x=>x.markers).some(x=>x.entity===2410800&&completed(x))')
  # Observed ownership must not undo explicit manual corrections.
  marker=page.evaluate("map.markers.find(x=>x.kind==='weapon'&&x.ownership?.length).id")
  page.evaluate("id=>{const m=map.markers.find(x=>x.id===id);receiveProgress({name:live.name,slot:'userdata0001',items:m.ownership,runes:[],bosses:[]});setDone(id,false);receiveProgress({name:live.name,slot:'userdata0001',items:m.ownership,runes:[],bosses:[]});}",marker)
  assert not page.evaluate('(id)=>completed(map.markers.find(x=>x.id===id))',marker)
  page.locator('#reset').click();assert not page.evaluate('follow')
  page.locator('#follow').click();assert page.evaluate('follow')
  # Camera clipping must select a finite point on the player side of an obstruction.
  assert page.evaluate('camera.position.toArray().every(Number.isFinite)')
  page.locator('#filters [data-kind="passage"]').click()
  assert page.evaluate('passageLines.geometry.vertices.length')>0
  # Actual-map navigation: test reachable nearby points; disconnected graphs must report failure.
  route=page.evaluate('''async()=>{navigationWorker();await new Promise(resolve=>{const t=setInterval(()=>{if(navReady){clearInterval(t);resolve();}},50)});return await new Promise(resolve=>{const listener=e=>{if(e.data.type!=='built'){navWorker.removeEventListener('message',listener);resolve(e.data)}};navWorker.addEventListener('message',listener);navWorker.postMessage({type:'route',token:map.id,request:9999,from:live.p,to:live.p.map((v,i)=>v+(i===0?1:0))});});}''')
  assert route['type']=='route',route
  assert route['points']
  # Worker fixtures: connected floor works, separated floor does not receive a fabricated edge.
  fixture=page.evaluate('''async()=>{const w=new Worker('route-worker.js');let result=[];await new Promise(r=>{w.onmessage=e=>r(e.data);const a=new Float32Array([0,0,0,4,0,0,0,0,4, 4,0,0,4,0,4,0,0,4, 30,0,0,34,0,0,30,0,4]);w.postMessage({type:'build',token:'test',positions:a.buffer},[a.buffer]);});for(const to of [[4,0,4],[30,0,0]])result.push(await new Promise(r=>{w.onmessage=e=>r(e.data);w.postMessage({type:'route',token:'test',request:1,from:[0,0,0],to});}));w.terminate();return result;}''')
  assert fixture[0]['type']=='route' and fixture[1]['type']=='error'
  page.locator('#language').click()
  assert page.locator('#help-button').inner_text()=='Help'
  assert not page.evaluate("/[\\u4e00-\\u9fff]/.test(document.querySelector('#panel').innerText)")
  page.screenshot(path=str(ROOT/'artifacts/live-map.png'))
  # Map-first compact view: no permanent sidebar or stacked desktop toolbars.
  for width,height in [(620,460),(560,400),(413,293)]:
   page.set_viewport_size({'width':width,'height':height})
   page.evaluate('setCompactView(true)');page.wait_for_timeout(150)
   assert page.locator('#panel').is_hidden()
   area=page.locator('#viewport').bounding_box()
   assert area['width']==width and area['height']>=height*.75,(width,height,area)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#mini-follow').is_visible()
   assert page.locator('#mini-overview').is_visible()
  page.set_viewport_size({'width':620,'height':460})
  page.locator('#language').evaluate('(b)=>b.click()')
  page.screenshot(path=str(ROOT/'artifacts/compact-live.png'))
  page.locator('#mini-list').click();assert page.locator('#panel').is_visible()
  assert page.locator('#list').bounding_box()['height']>80
  page.locator('#mini-list').click();assert page.locator('#panel').is_hidden()
  page.evaluate('setCompactView(false)');page.set_viewport_size({'width':1500,'height':900})
  assert page.locator('#panel').is_visible() and page.locator('#live-toolbar').is_visible()
  page.evaluate("receivePosition({position:null,status:'Waiting for game'})")
  assert page.locator('#player-arrow').is_hidden()
  assert not errors,errors
  (ROOT/'artifacts/live-verification.json').write_text(json.dumps({'errors':errors,'position':snapshot['position'],'tests':['live follow and arrow','save-slot progress','boss recognition','manual override precedence','passage directions','camera finite','actual collision routing','disconnected terrain rejection','English panel','disconnect handling'],'nearbyRoute':route},ensure_ascii=False,indent=2),encoding='utf-8')
  b.close()
 print('PASS: live tracking, progress, routing, localization, compact layouts and disconnect tests')
finally:server.shutdown()
