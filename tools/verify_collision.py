import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts').mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':620,'height':460})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/?compact=1');page.wait_for_function('window.mapReady&&window.collisionStats?.ready')
  result=page.evaluate('''async()=>{
   // Rendering can hide the original mesh while road tiles are visible.
   // Raycast an independent visible copy of the complete collision geometry.
   const reference=new THREE.Mesh(mesh.geometry,mesh.material);reference.updateMatrixWorld(true);
   const mismatches=[];let checks=0,maxDelta=0;const points=map.markers.filter(m=>m.p).slice(0,30).map(m=>m.p);
   for(const p of points)for(const a of [[0,1,0],[0,-1,0],[.7,.6,.2],[-.5,.4,.8]]){
    const o=new THREE.Vector3(p[0]+.13,p[1]+1.6,p[2]+.21),d=new THREE.Vector3(...a).normalize();
    for(const cutoff of [Infinity,p[1]+12]){const slow=new THREE.Raycaster(o,d,.2,60).intersectObject(reference).find(h=>h.point.y<cutoff),fast=mapRaycast(o,d,.2,60,cutoff);checks++;if(!!slow!==!!fast)mismatches.push({p,a,slow:slow?.distance,fast:fast?.distance});else if(slow){maxDelta=Math.max(maxDelta,Math.abs(slow.distance-fast.distance));if(Math.abs(slow.distance-fast.distance)>.001)mismatches.push({p,a,slow:slow.distance,fast:fast.distance});}}
   }
   let frames=0;const original=renderer.render;renderer.render=function(...a){frames++;return original.apply(this,a)};
   setMapActive(false);for(let i=0;i<20;i++)invalidate();await new Promise(r=>setTimeout(r,250));const hiddenFrames=frames;
   setMapActive(true);await new Promise(r=>setTimeout(r,150));const resumedFrames=frames;
   return {checks,mismatches,maxDelta,hiddenFrames,resumedFrames,stats:collisionStats};
  }''')
  assert not result['mismatches'],result
  assert result['hiddenFrames']==0 and result['resumedFrames']>0,result
  assert not errors,errors
  (ROOT/'artifacts/collision-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
  print(json.dumps(result));browser.close()
finally:server.shutdown()
