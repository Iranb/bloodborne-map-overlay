"""Behavior checks using simulated positions in the real map UI, without a game."""


def verify_auto_layers(page):
    map_id = 'm24_01_00_00'
    page.evaluate('(id)=>loadMap(id)', map_id)
    floors = page.evaluate('layerState.contentFloors')
    assert len(floors) > 5
    sequence = 0
    checks = []

    def receive(index=None, *, y=None, area=map_id):
        nonlocal sequence
        sequence += 1
        if y is None:
            f = floors[index]
            y = (f['low'] + f['high']) / 2
        payload = {'position': {'pid': 1, 'name': 'layer-test', 'mapId': area,
                                'level': 10, 'p': [-150 + sequence * .01, y, 10],
                                'yaw': 0, 'cameraYaw': 0}}
        page.evaluate('(s)=>receivePosition(s)', payload)

    def expect_auto(index):
        state = page.evaluate('layerState')
        assert state['index'] == index and state['playerIndex'] == index, state
        assert not state['pinned'], state
        assert page.locator('#layer-player').get_attribute('aria-pressed') == 'true'
        assert page.evaluate('material.uniforms.floorBottom.value===layerState.floor.low&&material.uniforms.floorTop.value===layerState.floor.high')

    def browse(index):
        page.locator('#layer-select').select_option(str(index))
        assert page.evaluate('layerState.pinned&&!follow')

    # A first connection must recover from a floor browsed while offline.
    page.evaluate('()=>receivePosition({position:null,status:"offline"})')
    browse(len(floors) - 1)
    receive(2)
    expect_auto(2)
    assert page.evaluate('follow&&viewFollow')
    checks.append('first connection after offline browsing')

    # Manual browsing remains usable, then resumes on a real player floor change.
    browse(0)
    receive(2)
    assert page.evaluate('layerState.index===0&&layerState.playerIndex===2&&layerState.pinned&&!follow')
    receive(3)
    expect_auto(3)
    assert page.evaluate('follow&&viewFollow')
    receive(1)
    expect_auto(1)
    receive(len(floors) - 1)
    expect_auto(len(floors) - 1)
    receive(2)
    expect_auto(2)
    checks.append('stairs both directions and elevator jumps')

    # The displayed floor and player arrow stay stable around a boundary.
    boundary = floors[2]['high']
    for y in (boundary - .2, boundary + .2, boundary - .1, boundary + .44):
        receive(y=y)
        expect_auto(2)
        assert page.evaluate('!arrow.hidden'), y
    receive(y=boundary + .46)
    expect_auto(3)
    for y in (boundary + .1, boundary - .2, boundary + .2, boundary - .44):
        receive(y=y)
        expect_auto(3)
        assert page.evaluate('!arrow.hidden'), y
    receive(y=boundary - .46)
    expect_auto(2)
    # A manual selection cannot alter the player's hysteresis baseline.
    browse(0)
    receive(y=boundary + .2)
    assert page.evaluate('layerState.index===0&&layerState.playerIndex===2&&layerState.pinned')
    receive(y=boundary + .46)
    expect_auto(3)
    checks.append('boundary hysteresis and visible player arrow')

    # Small/full buttons, gamepad A and native Follow all release a manual pin.
    for action in ('main button', 'mini button', 'gamepad A', 'native command', 'auto layer button'):
        browse(0)
        if action == 'main button':
            page.evaluate('()=>document.getElementById("follow").click()')
        elif action == 'mini button':
            page.locator('#mini-follow').click()
        elif action == 'gamepad A':
            page.evaluate('()=>receiveGamepad({buttons:0x1000,x:0,y:0,panX:0,panY:0,zoom:0})')
        elif action == 'native command':
            page.evaluate('()=>mapCommand("follow")')
        else:
            page.locator('#layer-player').click()
        expect_auto(3)
        assert page.evaluate('follow&&viewFollow&&distance===38')
    # Follow also recovers a pinned layer whose camera-follow flag is still true.
    page.evaluate('()=>selectMapLayer(0)')
    page.evaluate('()=>document.getElementById("follow").click()')
    expect_auto(3)
    assert page.evaluate('follow')
    checks.append('all five ways to resume following')

    # Pausing camera movement does not pause automatic floor selection.
    page.evaluate('()=>document.getElementById("follow").click()')
    assert page.evaluate('!follow')
    receive(2)
    expect_auto(2)
    assert page.evaluate('!follow')
    page.evaluate('()=>document.getElementById("follow").click()')
    expect_auto(2)
    checks.append('floor following independent of camera pause')

    # Overview lasts until the player changes floor, or Follow is pressed.
    page.evaluate('()=>resetView()')
    receive(2)
    assert page.evaluate('layerState.index===null&&layerState.pinned&&!follow')
    receive(3)
    expect_auto(3)
    page.locator('#layer-select').select_option('all')
    assert page.evaluate('layerState.index===null&&!follow')
    page.locator('#mini-follow').click()
    expect_auto(3)
    checks.append('overview recovery')

    # Disconnect/malformed data retains a useful view; reconnect restores auto.
    browse(0)
    page.evaluate('()=>receivePosition({position:null,status:"loading"})')
    assert page.evaluate('!live&&layerState.playerIndex===null&&layerState.index===0')
    receive(3)
    expect_auto(3)
    browse(0)
    page.evaluate('()=>receivePosition({position:{mapId:"m24_01_00_00",p:[0,null,0]}})')
    assert page.evaluate('!live&&layerState.playerIndex===null')
    receive(3)
    expect_auto(3)
    checks.append('disconnect and invalid-position recovery')

    # Do not force the player layer into a different area browsed with Auto area off.
    page.evaluate('()=>{autoMap=false;toggleUI();}')
    browse(0)
    receive(4, area='m24_00_00_00')
    assert page.evaluate('map.id==="m24_01_00_00"&&layerState.index===0&&layerState.pinned')
    receive(4, area='m99_99_00_00')
    assert page.evaluate('map.id==="m24_01_00_00"&&layerState.index===0&&layerState.pinned')
    page.evaluate('()=>{autoMap=true;toggleUI();}')
    receive(y=20, area='m24_00_00_00')
    assert page.evaluate('map.id==="m24_00_00_00"&&layerState.ready&&!layerState.pinned&&layerState.index===layerState.playerIndex')
    receive(3)
    expect_auto(3)
    checks.append('area transitions and manually browsed foreign areas')

    # Overlapping loads must leave only the latest area's floor metadata active.
    page.evaluate('async()=>{autoMap=false;await Promise.all([loadMap("m24_00_00_00"),loadMap("m24_01_00_00")]);autoMap=true;}')
    assert page.evaluate('map.id==="m24_01_00_00"&&layerState.mapId===map.id&&layerState.ready')
    receive(3)
    expect_auto(3)
    checks.append('latest async area load wins')

    # Repeated positions within one layer must not rebuild floor controls.
    page.evaluate('()=>{window.autoLayerOption=document.querySelector("#layer-select option");}')
    for _ in range(6):
        receive(3)
        expect_auto(3)
    assert page.evaluate('autoLayerOption===document.querySelector("#layer-select option")')
    checks.append('no control rebuild for same-floor positions')

    assert page.evaluate('follow&&!layerState.pinned')
    return checks
