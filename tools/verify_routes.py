"""Cross-layer route UI with real local assets and simulated player positions."""
import functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'artifacts/routes'
case = json.loads((OUT/'geometry.json').read_text('utf-8'))['crossFloorCase']
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True, args=['--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width':1180, 'height':800})
        page.route('**/favicon.ico', lambda r: r.fulfill(status=204))
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function('window.mapReady&&window.layerState?.ready')
        page.evaluate('(id)=>loadMap(id)', case['map'])
        snapshot={'position':{'pid':1, 'name':'route-test', 'mapId':case['map'], 'level':50, 'p':case['from'], 'yaw':0, 'cameraYaw':0}}
        page.evaluate('(p)=>receivePosition(p)', snapshot)
        before = page.evaluate('({floor:layerState.index,manual:JSON.stringify(saved.profiles)})')
        page.evaluate('(id)=>focusMarker(id)', case['marker'])
        assert page.evaluate('layerState.index') == before['floor'], 'Selection must retain player layer'
        page.wait_for_function('window.routeData?.target===routeTarget&&window.routeCrossings?.length>0', timeout=90000)
        page.wait_for_function('navigation?.material?.fragmentShader?.includes("mod(d")')
        assert page.evaluate('layerState.index') == before['floor']
        assert page.locator('#route-tools').is_visible()
        assert page.locator('#route-destination').is_visible()
        assert page.evaluate('navigation.geometry.vertices.length===routePoints.length&&routeContext.geometry.attributes.position.count>0')
        assert page.evaluate('routePoints.some(p=>!layerContains(p[1]))'), 'Fixture must include another floor'
        assert page.evaluate('routeCrossings.every(c=>Math.abs(c.to-c.from)===1)')
        assert page.locator('.layer-link-marker[data-kind="road"]').count()==0
        assert page.locator('.layer-link-marker[data-kind="route"]').count()>0
        page.evaluate('()=>{english=false;localize();updateRouteGuidance();}')
        assert '沿路' in page.locator('#route-status').inner_text()
        assert '青虛線' in page.locator('#route-legend').inner_text()
        page.locator('#detail-close').click()
        page.screenshot(path=str(OUT/'route-full.png'))
        page.locator('#layer-links').click()
        row=page.locator('.layer-link-row:has(.layer-jump)').first
        row.locator('button').first.click()
        a=page.evaluate('({p:target.toArray(),floor:layerState.index})')
        page.locator('#layer-link-jump').click()
        b=page.evaluate('({p:target.toArray(),floor:layerState.index})')
        assert a['p']==b['p'] and a['floor']!=b['floor']
        page.locator('#layer-link-close').click()
        page.locator('#layer-links').click()
        page.locator('#route-overview').click()
        # A floating rune uses its projected road layer, not its raw item height.
        page.evaluate('()=>{const m=map.markers.find(m=>m.id===routeTarget);window.routeOriginalY=m.p[1];m.p[1]=live.p[1]+30;markerSurfaces.set(m.id,live.p);refresh();}')
        label=page.evaluate('markerLayerLabel(map.markers.find(m=>m.id===routeTarget))')
        assert label=='同層',label
        page.evaluate('()=>{map.markers.find(m=>m.id===routeTarget).p[1]=routeOriginalY;}')
        for width,height in [(620,460),(413,293)]:
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('()=>{setCompactView(true);document.getElementById("route-overview").click();}')
            page.wait_for_timeout(300)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('#route-destination').is_visible()
        page.screenshot(path=str(OUT/'route-compact.png'))
        page.evaluate('()=>{english=true;localize();updateRouteGuidance();}')
        assert 'Whole route' in page.locator('#route-overview').inner_text()
        assert not page.evaluate('/[\\u4e00-\\u9fff]/.test(document.getElementById("route-status").textContent)')
        # Outdated worker replies and failed reroutes must not leave a stale line.
        page.evaluate('()=>{navWorker.onmessage({data:{type:"error",token:map.id,request:routeRequest-1,error:"stale"}});}')
        assert page.evaluate('!!routeData')
        page.evaluate('()=>{navWorker.onmessage({data:{type:"error",token:map.id,request:routeRequest,error:"blocked",errorEn:"blocked"}});}')
        assert page.evaluate('!navigation&&!window.routeData&&routeCrossings.length===0')
        assert page.locator('#route-tools').is_hidden()
        assert page.locator('#route-destination').is_hidden()
        assert page.evaluate('JSON.stringify(saved.profiles)')==before['manual']
        assert not errors,errors
        browser.close()
        (OUT/'ui.json').write_text(json.dumps({'tests':['player floor retained','complete cross-layer route','numbered route crossings','projected rune layer','crossing jump','small overlays','English','stale reply rejection','failed-route cleanup','manual progress preserved'],'errors':errors},ensure_ascii=False,indent=2),'utf-8')
        print('PASS: cross-layer route display, projected rune labels, small overlays, English and route lifecycle')
finally:
    server.shutdown()
