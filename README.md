# Bloodborne Exploration Map

[简体中文](README.zh-CN.md) · English

A Windows desktop companion for Bloodborne with a compact overlay, read-only player tracking, 3D collision terrain, height layers, item records and bilingual NPC quest guides.

## Features

- 16 base-game and The Old Hunters areas; orbit, pan, zoom, overhead view and roof cutaway.
- Only layers containing NPCs or items appear in the selector. Collected items still count; empty road bands merge into adjacent layers. Original geometry is retained.
- Layers automatically follow the player's height, with a small margin to prevent flicker at boundaries. D-pad or keyboard up/down temporarily browses other layers; tracking resumes when the player changes layer. **Auto layer** or enabling **Follow** returns immediately. **Links** shows numbered crossings along the current route and known ladder/device interaction anchors. Slice intersections are no longer shown as entrances.
- Live position, facing, camera direction, automatic area selection and continuous terrain routes across layers. Selecting a target retains the player’s layer. The full route fits into one view: gold on this layer, dashed cyan on other layers, numbered up/down crossings and a destination label. **Whole route** fits the route again; **Follow** returns to the player.
- Item and rune anchors project onto upward triangle interiors rather than remote vertices or ceiling undersides. Short stair seams require nearby support and wall clearance. Unconnected geometry and unknown ladder/elevator destinations remain explicit route failures.
- Filters for lamps, bosses, NPCs, weapons, attire, runes, hunter tools, key items, gems, items and passages.
- Three manual profiles, JSON import/export and optional autosave inventory/boss observations.
- **Inventory** shows the latest completed save's bag and storage counts, including shop and quest rewards without map coordinates. Stock replaces previous quantities; pickup history remains separate. Offline snapshots show their character, slot and save time; **Refresh save** rereads the configured save folder.
- English and Traditional Chinese UI, including all 19 quest guides, tray menus and messages. Use **EN / 繁中** to switch; the choice is remembered.
- Compact/fullscreen views, always-on-top, opacity and mouse passthrough.

## Requirements and compatibility

Windows x64, Microsoft Edge WebView2 Runtime and locally generated map data are required. The self-contained build includes .NET; building from source requires the .NET 10 SDK.

The reader supports the verified Bloodborne v1.09 guest layout in `bbhost` (tested with v0.2.16) and `bb-probe` / `bb-probe-*`. It validates code signatures before reading and refuses unknown layouts. Other emulator process names and procedural chalice dungeons are unsupported.

The repository and desktop downloads contain **no game geometry, extracted game text, saves, game executable or game icon**. Generate data from your own local installation using [DATA_SETUP.md](docs/DATA_SETUP.md). Until `web/data/maps.json` and its meshes are present, the app displays setup guidance.

## Build and run

```powershell
dotnet publish overlay-app -c Release -r win-x64 --self-contained true -o publish
.\publish\BloodborneMap.exe
```

Generate data before building, or copy your generated files into `publish/web/data`. Close the map before replacing an existing build. Launch with `--watch --follow` to show the compact map when a supported game host starts and follow the player.

### Save directory

Copy `settings.example.json` to `settings.json` beside the executable and set the folder containing `userdata0000`, etc. Relative paths resolve from the executable directory:

```json
{
  "BbhostSaveDirectory": "../my-bbhost/data/saves/SPRJ0005",
  "BbportSaveDirectory": "../my-bbport/user/savedata/1/CUSA00207/SPRJ0005"
}
```

`BLOODBORNE_SAVE_DIRECTORY` overrides both paths. A configured `SaveDirectory` overrides the per-host settings. Without configuration, bbhost uses `data/saves/SPRJ0005` beside its executable; bb-probe uses `BB_USER_DIR`, or its adjacent `user` directory, followed by `savedata/1/CUSA00207/SPRJ0005`. Custom locations require explicit configuration. Manual records work without a matching stable save.

Preferences and records stay under `%LOCALAPPDATA%\BloodborneMap`. Exports can contain character names and progress.

## Controls

| Input | Action |
|---|---|
| Left drag / right drag / wheel | Orbit / pan / zoom |
| Up / down, keyboard or D-pad | Change layer |
| Auto layer or enable Follow / Overview | Return to the player's layer / show all layers until the player changes layer |
| Click marker; Shift-click or Space | Select or route; manually correct progress |
| Ctrl+Alt or Ctrl+Shift + M / F / L / R | Show-hide / fullscreen-compact / passthrough / restore |
| Ctrl+Alt or Ctrl+Shift + left / right | Previous / next area |
| Ctrl+Alt or Ctrl+Shift + G | Controller map mode |

Full controller map mode requires a host implementing `BloodborneMapInputCaptureV1` input isolation. Mute or View+Menu toggles it; B exits. Left stick rotates, right stick pans, triggers zoom, shoulders switch areas, A follows, X routes, Y toggles marker categories, L3 follows camera direction, R3 shows the overview and touchpad expands the map.

In bbhost, D-pad browsing works without full map mode and also sends the D-pad to the game. Browse in a safe place. The map does not pause the game.

## Data and progress limits

The app opens the game with query/read permissions. It does not inject code or write memory. Save reading accepts two identical snapshots and never writes saves. Ownership may come from another source; previously consumed items may need manual correction. NPC proximity records a visit, not dialogue or quest completion. Lamps and passages need manual confirmation.

Selecting a completed marker preserves its record. Only the checkbox, Shift-click, Space or the detail action changes a manual record. **Clear manual override** restores automatic observations for one marker. Current bag/storage counts are independent of manual progress and historical ownership. Owning a consumable does not check every pickup source of that item. Rune ownership requires a reference in the bag/storage, rather than an orphan entry in the save's object registry. Internal defaults for empty equipment slots are excluded. Counts update after the game saves; they are not a live view of unsaved inventory changes.

Static collision cannot establish current door, elevator or one-way states. Disconnected terrain produces no invented route. Unknown passage destinations stay unspecified. Some geometry/pickups are missing; this is not a complete achievement or collection guide. Quest guides contain spoilers.

## Verification

```powershell
python -m pip install -r requirements-dev.txt
dotnet run --project tools/LayerTests -c Release
dotnet run --project tools/SettingsTests -c Release
dotnet run --project tools/SaveProgressTests -c Release
python tools/verify_inventory.py
python tools/verify_english.py
python tools/verify_layers.py
node tools/verify_routes.cjs
python tools/verify_routes.py
python tools/verify.py
python tools/verify_quests.py
python tools/verify_collision.py
```

Browser checks need Microsoft Edge and local map data. Reports go to ignored `artifacts/`. The .NET checks need no game data. The Windows package is built with the publish command above.

## License and credits

Original desktop code, web interface, guides and Python tools use the [MIT License](LICENSE), copyright © 2026 Iranb and contributors. The optional offline extractor under `tools/Extract` retains **GPL-3.0**. Bundled components keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Game assets are excluded from this grant and distribution.

Interface/controller work builds on [DS2-3D-Map-Overlay](https://github.com/Iranb/ds2-3d-map-overlay). Rendering uses Three.js r73; the desktop host uses Microsoft WebView2. This unofficial fan utility is not affiliated with FromSoftware or Sony Interactive Entertainment.
