# Sources and third-party notices

- Interface and workflow reference: local DS2-3D-Map-Overlay, from https://github.com/Iranb/ds2-3d-map-overlay. GamepadReader.cs is adapted from this MIT-licensed project (license retained in licenses/DS2MapOverlay-MIT.txt). The Bloodborne reader was independently derived from local guest code; the DS2 game-memory reader is not used.
- Three.js r73, MIT: https://github.com/mrdoob/three.js. License included in `licenses/three-r73-LICENSE`.
- Microsoft WebView2 and .NET runtime: upstream Microsoft terms, WebView2, .NET runtime and Windows Desktop runtime licenses/notices are included under `licenses/`.
- Offline extraction uses SoulsFormats (https://github.com/JKAnderson/SoulsFormats, GPL-3.0) and the legacy HKX parser from https://github.com/Meowmaritus/MVDX_Classic. The offline extractor is GPL-3.0 (`tools/Extract/LICENSE`); these libraries are not linked to or shipped inside the desktop runtime.
- Compressed collision decoding follows the data layout implemented in MVDX_Classic's `FlverSubmeshRenderer.cs`; triangle and quad primitives are exported after MSB transforms. Dependency source revisions and build steps are listed in `tools/Extract/README.md`.
- Event/entity semantic reference: https://github.com/Grimrukh/soulstruct-vanilla/tree/main/bloodborne. Downloaded references are stored only under local `artifacts/reference` and are not executed or included in the desktop package.
- Local generated geometry, item text and map events originate from the user's Bloodborne installation. Game assets and names belong to their respective rights holders. Extracted game data, the game icon, saves, reference downloads and local diagnostics are excluded from this repository and the desktop download; the application MIT license does not cover game assets.

This is an unofficial fan utility, not affiliated with FromSoftware or Sony Interactive Entertainment.

- Save-format facts and boss-flag offsets: https://github.com/Noxde/Bloodborne-save-editor. Only read-only format interpretation and data offsets are used; this map does not include save editing.
- Bloodborne camera-layout cross-check: https://github.com/ajungg/BBShadPS4Mouse; no injected mouse/control code is used.
