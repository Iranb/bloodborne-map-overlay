# Generate your local map data / 本地数据准备

## English

The download contains the map application, not Bloodborne assets. You need your own extracted Bloodborne v1.09 base-game + The Old Hunters files, with a `dvdroot_ps4` folder containing `map/mapstudio`, `msg/zhotw`, `msg/engus`, `paramdef` and `param/gameparam`. This tool does not obtain, decrypt or install the game.

Install Git, the .NET 10 SDK, Python, and the packages in `requirements-dev.txt`. Clone this repository, open PowerShell at its root, then run:

```powershell
python -m pip install -r requirements-dev.txt
.\tools\Extract\prepare-dependencies.ps1
.\tools\prepare-map-data.ps1 -GameRoot "X:\your-game\dvdroot_ps4"
dotnet publish overlay-app -c Release -r win-x64 --self-contained true -o publish
.\publish\BloodborneMap.exe
```

Dependency preparation fetches pinned SoulsFormats and MVDX_Classic source, builds the optional GPL-3.0 extractor dependencies, and keeps the source/licenses under ignored `artifacts/dependencies`. Details are in [the extractor README](../tools/Extract/README.md).

Map preparation reads local MSB, collision HKX, PARAM and FMG files, then exports the latest NPC patch-map placements. It downloads the 16 EVS semantic reference scripts from the pinned Soulstruct-vanilla revision `e6de1b79370755152f4f89c4a106a2d67c9ae674`. These references are parsed as text, never executed. The Python builders produce `web/data/maps.json`, 16 `.mesh` files and `layers.json`.

For an already downloaded desktop build, copy those generated files into its `web/data` folder. Retain the bundled `quests.json` and `boss-flags.json`. To preview in a browser, serve the `web` folder with `python -m http.server --directory web 8765` and open `http://localhost:8765`; live tracking needs the desktop app.

If preparation fails, check the extractor output in `artifacts/extracted/raw.json` and the console errors. Do not use an incomplete extraction as a complete map. File revisions/layouts outside the listed game version are unverified. The original local installation had two missing collision parts in Yahar'gul and six unlocated pickup events.

The optional scripts require internet access for source/reference downloads and NuGet restoration. Generated game text/geometry, references, saves and diagnostics are intentionally ignored by Git. Do not include them when sharing the application.

## 中文

下载包只包含地图程序。需要你自己的 Bloodborne v1.09 本体及《老猎人》解包文件；`dvdroot_ps4` 下应有 `map/mapstudio`、`msg/zhotw`、`msg/engus`、`paramdef` 和 `param/gameparam`。本工具不获取、解密或安装游戏。

安装 Git、.NET 10 SDK、Python 及 `requirements-dev.txt` 中的依赖，在仓库根目录按上方命令执行。第一条脚本下载固定版本的 SoulsFormats 和 MVDX_Classic 源码并构建可选 GPL-3.0 提取器的依赖；源码和许可保留在不上传的 `artifacts/dependencies`。

第二条脚本读取本地地图、碰撞、参数、文字及最新补丁版 NPC 配置，下载固定版本的 16 份 Soulstruct 事件参考，作为文字解析而不执行。随后生成 `web/data/maps.json`、16 个 `.mesh` 文件及 `layers.json`。

使用已下载的桌面程序时，将生成文件复制到程序的 `web/data`，保留包内的 `quests.json` 和 `boss-flags.json`。浏览器预览可执行 `python -m http.server --directory web 8765` 后访问 `http://localhost:8765`；实时定位需要桌面程序。

失败时检查控制台和 `artifacts/extracted/raw.json`，不要把不完整提取当作完整地图。已验证版本以外的布局暂未确认；原本本机数据有两个缺失碰撞部件和六个未定位拾取事件。依赖及事件参考下载需要联网。生成的游戏内容、存档和个人诊断不随应用上传。
