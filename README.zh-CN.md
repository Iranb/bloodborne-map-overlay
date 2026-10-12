# Bloodborne 探索地图

简体中文 · [English](README.md)

血源 Windows 桌面辅助地图，支持小窗悬浮、只读人物定位、三维碰撞地形、分层浏览、收集记录及中英文 NPC 支线指南。

## 功能

- 本体及《老猎人》16 个区域，支持旋转、平移、缩放、俯视和切屋顶。
- 只显示含 NPC 或物品的层；已收集物品仍计入，空层道路合并到相邻层，保留原始地形和连接位置。
- 键盘或手柄方向键上下切层；“人物层”恢复自动分层及跟随；“连接”查看道路交点和已确认的梯子、门、机关位置。
- 实时位置、人物与镜头朝向、自动切图、地形寻路。
- 灯笼、Boss、NPC、武器、服装、符文、猎人工具、重要道具、宝石、一般物品和通道分类。
- 三份手动档案、JSON 导入导出、可选的存档物品与 Boss 进度识别。
- 繁体中文及英文界面，包括全部 19 条支线、托盘菜单和提示。点 **EN / 繁中** 切换并记忆选择。
- 大小窗、置顶、透明度、鼠标穿透与快捷键。

## 环境与适配

需要 Windows x64、Microsoft Edge WebView2 Runtime 和本地地图数据。独立运行包自带 .NET；源码构建需要 .NET 10 SDK。

定位适配已验证的 Bloodborne v1.09 客体布局，支持 `bbhost`（在 v0.2.16 验证）与 `bb-probe` / `bb-probe-*`。读取前检查代码签名，未知布局拒绝连接。其他模拟器进程名及程序生成金杯地牢暂不支持。

仓库与下载包不含游戏地形、提取的游戏文字、存档、游戏程序或游戏图标。请按[数据准备说明](docs/DATA_SETUP.md)从自己的本地游戏生成数据。缺少 `web/data/maps.json` 和对应网格时，程序会显示准备提示。

## 构建与启动

```powershell
dotnet publish overlay-app -c Release -r win-x64 --self-contained true -o publish
.\publish\BloodborneMap.exe
```

先生成数据再构建，或将自己的数据复制到 `publish/web/data`。替换旧版前先退出地图。使用 `--watch --follow` 启动，检测到适配游戏进程时自动显示小窗并跟随。

### 存档目录

把 `settings.example.json` 复制为可执行文件旁的 `settings.json`，填写包含 `userdata0000` 等文件的目录。相对路径以地图程序所在目录为基准：

```json
{
  "BbhostSaveDirectory": "../my-bbhost/data/saves/SPRJ0005",
  "BbportSaveDirectory": "../my-bbport/user/savedata/1/CUSA00207/SPRJ0005"
}
```

`BLOODBORNE_SAVE_DIRECTORY` 环境变量优先级最高，其次是配置中的 `SaveDirectory`，最后是对应模拟器字段。无配置时，bbhost 使用程序旁的 `data/saves/SPRJ0005`；bb-probe 使用 `BB_USER_DIR` 或程序旁的 `user`，再拼接 `savedata/1/CUSA00207/SPRJ0005`。自定义存档位置需要明确配置。没有匹配且稳定的存档时，手动记录仍可使用。

设置及探索记录保存在 `%LOCALAPPDATA%\BloodborneMap`。导出的记录可能含角色名和探索进度。

## 操作

| 操作 | 功能 |
|---|---|
| 左键拖动／右键拖动／滚轮 | 旋转／平移／缩放 |
| 键盘或手柄方向键上下 | 切换层级 |
| 人物层／全图 | 恢复跟随／显示全部层 |
| 点击目标；Shift 点击或空格 | 选择或导航；手动修正进度 |
| Ctrl+Alt 或 Ctrl+Shift + M／F／L／R | 显示隐藏／大小窗／穿透／恢复 |
| Ctrl+Alt 或 Ctrl+Shift + 左右键 | 上一区域／下一区域 |
| Ctrl+Alt 或 Ctrl+Shift + G | 手柄地图模式 |

完整手柄模式需要游戏主程序提供 `BloodborneMapInputCaptureV1` 输入隔离。静音键或 View+Menu 切换，B 退出；左摇杆旋转、右摇杆平移、扳机缩放、肩键切图、A 跟随、X 导航、Y 切换标记分类、L3 镜头方向、R3 全图，触控板切换大小窗。

bbhost 无需完整模式即可用方向键切层，但方向键同时仍会传给游戏，请在安全位置浏览。地图不会暂停游戏。

## 数据与进度边界

游戏进程仅使用查询和读取权限，不注入、不写内存。存档须两次读取一致才接受，地图不写存档。已持有物品可能来自其他来源，开始观察前已消耗的物品需手动修正。NPC 接近只表示到访，不表示完成对话或支线；灯笼及通道需手动确认。

静态地形无法确认门、升降机和单向通道的当前状态。不连通时不虚构路线，未知通道的另一端不指定坐标。有少量缺失地形和未定位拾取事件，地图不等于完整成就或全收集攻略。支线含剧透。

## 验证

```powershell
python -m pip install -r requirements-dev.txt
dotnet run --project tools/LayerTests -c Release
dotnet run --project tools/SettingsTests -c Release
python tools/verify_english.py
python tools/verify_layers.py
python tools/verify.py
python tools/verify_quests.py
python tools/verify_collision.py
```

浏览器检查需要 Microsoft Edge 和本地地图数据；结果保存在不上传的 `artifacts/`。两项 .NET 检查无需游戏数据。Windows 运行包按上方 publish 命令构建。

## 许可与致谢

原创桌面程序、网页界面、指南和 Python 工具使用 [MIT 协议](LICENSE)，版权 © 2026 Iranb 及贡献者。可选的 `tools/Extract` 离线提取器保留 **GPL-3.0**；第三方组件保留各自许可，见[第三方说明](THIRD_PARTY_NOTICES.md)。游戏资产不在此授权范围内，也不随仓库发布。

界面及手柄功能参考 [DS2-3D-Map-Overlay](https://github.com/Iranb/ds2-3d-map-overlay)，三维显示使用 Three.js r73，桌面宿主使用 Microsoft WebView2。本项目是非官方玩家工具，与 FromSoftware 或 Sony Interactive Entertainment 无隶属关系。
