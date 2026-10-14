using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace BloodborneMap;
static class Program {
 // Host builds can have a suffix. The reader still validates the guest image
 // before accepting a candidate; a matching process name alone is insufficient.
 internal static Process? FindGame(BloodborneReader reader) {
  // Retain the verified live host; discovery is only needed after exit.
  if(reader.ProcessId!=0){
   Process? current=null;
   try{current=Process.GetProcessById(reader.ProcessId);if(reader.IsAlive&&!current.HasExited)return current;}catch{}
   current?.Dispose();reader.Dispose();
  }
  var candidates=new List<Process>();
  foreach(var process in Process.GetProcesses()){
   try{if(BloodborneReader.IsGameProcess(process.ProcessName)){candidates.Add(process);continue;}}catch{}
   process.Dispose();
  }
  Process? selected=null;int attached=reader.ProcessId;
  try{
   foreach(var candidate in candidates.OrderByDescending(p=>p.Id==attached)){
    try{if(!candidate.HasExited&&reader.Attach(candidate)){selected=candidate;break;}}catch{}
   }
   if(selected==null)reader.Dispose();
   return selected;
  }finally{foreach(var candidate in candidates)if(candidate!=selected)candidate.Dispose();}
 }
 [STAThread] static void Main(string[] args) {
  if(args.Length==3&&args[0]=="--diagnose"){
   using var reader=new BloodborneReader();using var process=args[1]=="auto"?FindGame(reader):Process.GetProcessById(int.Parse(args[1]));if(process!=null)reader.Attach(process);var position=reader.ProcessId!=0?reader.Sample():null;
   File.WriteAllText(args[2],JsonSerializer.Serialize(new{reader.Status,reader.HostKind,reader.SaveDirectory,reader.InputGuard,position,progress=position==null?null:new SaveProgressReader().Read(position.name,reader.SaveDirectory)}));return;
  }
  using var mutex=new Mutex(true,@"Local\BloodborneMap.Exploration",out var first);
  if(!first){MessageBox.Show(AppLanguage.Text("地圖已在執行，請按 Ctrl+Alt+M 或點擊托盤圖示。","The map is already running. Press Ctrl+Alt+M or click its tray icon."),"Bloodborne Map");return;}
  ApplicationConfiguration.Initialize();Application.Run(new MapWindow(args.Contains("--watch")));
 }
}
sealed class MapWindow:Form {
 readonly WebView2 web=new(){Dock=DockStyle.Fill,DefaultBackgroundColor=Color.FromArgb(11,15,20)};
 static string L(string zh,string en)=>AppLanguage.Text(zh,en);
 readonly List<(ToolStripItem item,string zh,string en)> menuLabels=new();
 ToolStripItem MenuLabel(ToolStripItem item,string zh,string en){menuLabels.Add((item,zh,en));item.Text=L(zh,en);return item;}
 void LocalizeNative(){Text=tray.Text=L("Bloodborne · 探索地圖","Bloodborne · Exploration Map");foreach(var (item,zh,en) in menuLabels)item.Text=L(zh,en);sentStatus=null;}
 readonly NotifyIcon tray=new(){Icon=SystemIcons.Information,Text="Bloodborne · 探索地圖",Visible=true};
 readonly System.Windows.Forms.Timer timer=new(){Interval=200};
 readonly System.Windows.Forms.Timer pads=new(){Interval=33};
 readonly BloodborneReader reader=new();
 readonly SaveProgressReader saves=new();
 readonly GamepadReader pad=new();
 readonly LayerInput layerInput=new();
 DateTime nextAttach=DateTime.MinValue,nextSave=DateTime.MinValue;
 LivePosition? sentPosition;
 string? sentStatus;
 bool progressBusy,frontendReady;
 string progressIdentity="";
 long samples,positionMessages,sampleTicks;
 void UpdatePolling()=>timer.Interval=!Visible?1500:smallMode&&!expanded?500:250;
 object? lastProgress;
 IntPtr gameHandle;
 ushort previousButtons;
 bool padMode, expanded, smallMode;
 readonly string data=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BloodborneMap");
 bool clickThrough,watch,exiting,gameWasRunning,webReady;
 [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
 [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h,int index,int value);
 [DllImport("user32.dll")] static extern bool ReleaseCapture();
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool SetProp(IntPtr h,string name,IntPtr value);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr RemoveProp(IntPtr h,string name);
 protected override bool ShowWithoutActivation=>!padMode;
 public MapWindow(bool watchMode) {
  watch=watchMode;smallMode=watchMode;Text="Bloodborne · 探索地圖";Icon=Icon.ExtractAssociatedIcon(Environment.ProcessPath!);tray.Icon=Icon;Size=new Size(1180,800);MinimumSize=new Size(620,420);StartPosition=FormStartPosition.CenterScreen;TopMost=true;BackColor=Color.FromArgb(11,15,20);Controls.Add(web);
  Directory.CreateDirectory(data);
  var menu=new ContextMenuStrip();MenuLabel(menu.Items.Add("",null,(_,_)=>ToggleVisible()),"顯示／隱藏（Ctrl+Alt+M）","Show / hide (Ctrl+Alt+M)");MenuLabel(menu.Items.Add("",null,(_,_)=>ToggleCompact()),"全屏地圖／小窗（Ctrl+Alt+F）","Fullscreen / compact (Ctrl+Alt+F)");MenuLabel(menu.Items.Add("",null,(_,_)=>TogglePass()),"鼠標穿透（Ctrl+Alt+L）","Mouse passthrough (Ctrl+Alt+L)");
  MenuLabel(menu.Items.Add("",null,(_,_)=>SetPadMode(!padMode)),"手柄地圖模式","Controller map mode");
  MenuLabel(menu.Items.Add("",null,(_,_)=>Borderless()),"遊戲無邊框全屏","Borderless game window");
  var pin=new ToolStripMenuItem("保持置頂"){Checked=true,CheckOnClick=true};pin.CheckedChanged+=(_,_)=>TopMost=pin.Checked;menu.Items.Add(pin);MenuLabel(pin,"保持置頂","Always on top");
  foreach(var alpha in new[]{100,90,75,60}){int value=alpha;MenuLabel(menu.Items.Add("",null,(_,_)=>Opacity=value/100.0),$"透明度 {value}%",$"Opacity {value}%");}
  MenuLabel(menu.Items.Add("",null,(_,_)=>{exiting=true;Close();}),"退出","Exit");tray.ContextMenuStrip=menu;LocalizeNative();tray.DoubleClick+=(_,_)=>ToggleVisible();
  Shown+=async(_,_)=>await InitializeWeb();
  timer.Tick+=(_,_)=>PollLive();pads.Tick+=(_,_)=>PollPad();
  VisibleChanged+=(_,_)=>{UpdatePolling();sentPosition=null;sentStatus=null;layerInput.Reset();Post(new{action="activity",active=Visible});};
  FormClosing+=(_,e)=>{if(!exiting&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;SetPadMode(false);Hide();}else{timer.Stop();pads.Stop();reader.Dispose();tray.Dispose();}};
 }
 protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);uint[] keys=[0x4D,0x46,0x4C,0x25,0x27,0x52,0x47];for(int i=0;i<keys.Length;i++){RegisterHotKey(Handle,i+1,0x4003,keys[i]);RegisterHotKey(Handle,i+11,0x4006,keys[i]);}}
 protected override void OnHandleDestroyed(EventArgs e){for(int i=1;i<=17;i++)UnregisterHotKey(Handle,i);base.OnHandleDestroyed(e);}
 protected override void WndProc(ref Message m){if(m.Msg==0x312){switch(m.WParam.ToInt32()%10){case 1:ToggleVisible();break;case 2:ToggleCompact();break;case 3:TogglePass();break;case 4:Command("previous");break;case 5:Command("next");break;case 6:SmallWindow();break;case 7:SetPadMode(!padMode);break;}}base.WndProc(ref m);}
 async Task InitializeWeb(){try{
  var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(data,"WebView"));await web.EnsureCoreWebView2Async(env);
  void LowerOwnProcesses(){foreach(var item in env.GetProcessInfos())try{using var process=Process.GetProcessById(item.ProcessId);process.PriorityClass=ProcessPriorityClass.BelowNormal;}catch{}}
  try{using var self=Process.GetCurrentProcess();self.PriorityClass=ProcessPriorityClass.BelowNormal;}catch{}
  LowerOwnProcesses();env.ProcessInfosChanged+=(_,_)=>LowerOwnProcesses();
  web.CoreWebView2.SetVirtualHostNameToFolderMapping("bloodborne-map.local",Path.Combine(AppContext.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.DenyCors);
  web.CoreWebView2.Settings.AreDevToolsEnabled=false;web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;web.CoreWebView2.Settings.IsStatusBarEnabled=false;
  web.CoreWebView2.NavigationStarting+=(_,e)=>{if(!e.Uri.StartsWith("https://bloodborne-map.local/",StringComparison.OrdinalIgnoreCase)&&e.Uri!="about:blank")e.Cancel=true;};
  web.CoreWebView2.NewWindowRequested+=(_,e)=>e.Handled=true;
  web.CoreWebView2.WebMessageReceived+=OnMessage;web.CoreWebView2.NavigationCompleted+=(_,_)=>{webReady=true;Post(new{action="window",expanded,compact=smallMode});Post(new{action="activity",active=Visible});Post(new{action="language",english=AppLanguage.English});};
  web.Source=new Uri("https://bloodborne-map.local/index.html");timer.Start();pads.Start();if(watch){SmallWindow();Hide();}
 }catch(Exception ex){MessageBox.Show(L("地圖初始化失敗：","Map initialization failed: ")+ex.Message+L("\n請確認已安裝 Microsoft Edge WebView2 Runtime。","\nInstall Microsoft Edge WebView2 Runtime and retry."),Text);}}
 void ToggleVisible(){if(Visible){SetPadMode(false);Hide();}else{Show();WindowState=FormWindowState.Normal;Activate();}}
 void SmallWindow(){expanded=false;smallMode=true;UpdatePolling();FormBorderStyle=FormBorderStyle.None;var scale=DeviceDpi/96f;Size=new Size((int)(620*scale),(int)(460*scale));var area=Screen.FromControl(this).WorkingArea;Location=new Point(area.Right-Width-15,area.Top+20);Show();Post(new{action="window",expanded,compact=smallMode});}
 void ToggleCompact(){if(expanded)SmallWindow();else{expanded=true;smallMode=false;UpdatePolling();FormBorderStyle=FormBorderStyle.None;Bounds=Screen.FromControl(this).WorkingArea;Show();}Post(new{action="window",expanded,compact=smallMode});}
 void TogglePass(){clickThrough=!clickThrough;int style=GetWindowLong(Handle,-20);SetWindowLong(Handle,-20,clickThrough?style|0x20|0x80000:style&~0x20);if(clickThrough){tray.ShowBalloonTip(2500,"Bloodborne Map",L("已開啟鼠標穿透；Ctrl+Alt+L 解除。","Mouse passthrough enabled. Press Ctrl+Alt+L to disable."),ToolTipIcon.Info);}else Activate();}
 async void Command(string name){if(webReady)await web.CoreWebView2.ExecuteScriptAsync("window.mapCommand?.("+JsonSerializer.Serialize(name)+")");}
 async void OnMessage(object? sender,CoreWebView2WebMessageReceivedEventArgs e){try{using var doc=JsonDocument.Parse(e.WebMessageAsJson);var msg=doc.RootElement;switch(msg.GetProperty("type").GetString()){
  case "language":AppLanguage.Set(msg.GetProperty("english").GetBoolean());LocalizeNative();break;
  case "compact":ToggleCompact();break;case "hide":SetPadMode(false);Hide();break;case "lock":TogglePass();break;
  case "ready":frontendReady=true;sentPosition=null;sentStatus=null;nextSave=DateTime.MinValue;if(Environment.GetCommandLineArgs().Contains("--follow"))Command("follow");await RefreshInventory();break;
  case "inventory-refresh":await RefreshInventory();break;
  case "gamepad":SetPadMode(!padMode);break;case "exit-gamepad":SetPadMode(false);break;case "borderless":Borderless();break;
  case "drag":ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);break;
  case "export":using(var dialog=new SaveFileDialog{Filter=L("探索記錄 (*.json)|*.json","Exploration records (*.json)|*.json"),FileName="Bloodborne-exploration.json"}){if(dialog.ShowDialog(this)==DialogResult.OK)File.WriteAllText(dialog.FileName,msg.GetProperty("content").GetString());}break;
  case "import":using(var dialog=new OpenFileDialog{Filter=L("探索記錄 (*.json)|*.json","Exploration records (*.json)|*.json")}){if(dialog.ShowDialog(this)!=DialogResult.OK)break;if(new FileInfo(dialog.FileName).Length>2_000_000)throw new InvalidDataException(L("記錄檔超過 2 MB","Record file exceeds 2 MB"));using var imported=JsonDocument.Parse(File.ReadAllText(dialog.FileName));await web.CoreWebView2.ExecuteScriptAsync("window.importRecords("+imported.RootElement.GetRawText()+")");}break;
 }}catch(Exception ex){MessageBox.Show(L("操作失敗：","Operation failed: ")+ex.Message,Text);}}
 async Task RefreshInventory(){
  if(progressBusy||!frontendReady)return;
  string? root=reader.SaveDirectory??MapSettings.ResolveSaveDirectory("bbhost",null)??MapSettings.ResolveSaveDirectory("bbport",null);
  if(root==null){Post(new{action="notice",text="請先設定存檔目錄。",textEn="Configure the save directory first."});return;}
  var position=sentPosition;string sourceIdentity=progressIdentity;progressBusy=true;
  try{
   var progress=await Task.Run(()=>saves.Read(position?.name,root,true));
   if(IsDisposed||progressIdentity!=sourceIdentity)return;
   if(progress==null){Post(new{action="notice",text="尚未找到完整存檔；請等待遊戲保存。",textEn="No completed save found. Wait for the game to save."});return;}
   lastProgress=progress;Post(new{action="progress",progress,offline=position==null,pid=position?.pid});
  }finally{progressBusy=false;}
 }
 void Post(object value){if(webReady&&!IsDisposed)web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(value));}
 async void PollLive(){
  if(DateTime.UtcNow>=nextAttach){nextAttach=DateTime.UtcNow.AddSeconds(2);using var game=Program.FindGame(reader);bool running=game!=null;
   gameHandle=game?.MainWindowHandle??IntPtr.Zero;
   if(watch&&running&&!gameWasRunning)Show();if(watch&&!running&&gameWasRunning)Hide();gameWasRunning=running;
  }
  // Hidden overlays need host-lifetime checks, not game-memory/save polling.
  if(!Visible||!frontendReady)return;
  long sampleStart=Stopwatch.GetTimestamp();
  var position=reader.ProcessId!=0?reader.Sample():null;
  sampleTicks+=Stopwatch.GetTimestamp()-sampleStart;samples++;
  string identity=position==null?"":$"{position.pid}:{position.name}:{reader.SaveDirectory}";
  if(identity!=progressIdentity){progressIdentity=identity;lastProgress=null;nextSave=DateTime.MinValue;}

  var status=reader.ProcessId==0?"等待 Bloodborne":reader.Status;
  bool changed=position==null?sentPosition!=null:sentPosition==null||position.mapId!=sentPosition.mapId||position.name!=sentPosition.name||position.level!=sentPosition.level||position.pid!=sentPosition.pid||position.p.Zip(sentPosition.p,(a,b)=>(a-b)*(a-b)).Sum()>.0004||Math.Abs(position.yaw-sentPosition.yaw)>.004||position.cameraYaw.HasValue!=sentPosition.cameraYaw.HasValue||Math.Abs(position.cameraYaw.GetValueOrDefault()-sentPosition.cameraYaw.GetValueOrDefault())>.004;
  if(Visible&&frontendReady&&(changed||status!=sentStatus)){bool resuming=sentPosition==null;Post(new{action="position",position,status,statusEn=reader.ProcessId==0?"Waiting for Bloodborne":reader.StatusEn});positionMessages++;sentPosition=position;sentStatus=status;if(resuming&&lastProgress!=null)Post(new{action="progress",progress=lastProgress,pid=position?.pid});}
  if(position!=null&&frontendReady&&!progressBusy&&DateTime.UtcNow>=nextSave){nextSave=DateTime.UtcNow.AddSeconds(15);progressBusy=true;string? saveDirectory=reader.SaveDirectory;string sourceIdentity=progressIdentity;bool force=lastProgress==null;try{var progress=await Task.Run(()=>saves.Read(position.name,saveDirectory,force));if(progress!=null&&progressIdentity==sourceIdentity&&!IsDisposed){lastProgress=progress;if(Visible)Post(new{action="progress",progress,pid=position.pid});}}finally{progressBusy=false;}}
 }
 void Borderless(){if(gameHandle==IntPtr.Zero)return;var r=Screen.FromHandle(gameHandle).Bounds;SetWindowLong(gameHandle,-16,GetWindowLong(gameHandle,-16)&~0x00cf0000);SetWindowPos(gameHandle,IntPtr.Zero,r.Left,r.Top,r.Width,r.Height,0x0020|0x0004|0x0010);Post(new{action="notice",text="已設定遊戲無邊框全屏。",textEn="Game window set to borderless fullscreen."});}
 void SetPadMode(bool value){
  if(value&&!reader.InputGuard){Post(new{action="notice",text="手柄地圖模式需要輸入隔離版遊戲；安裝後重啟遊戲即可啟用。滑鼠、定位和导航可正常使用。",textEn="Controller map mode requires a game host with input isolation. Mouse controls, tracking and navigation remain available."});return;}
  padMode=value;if(value){if(clickThrough)TogglePass();Show();SetForegroundWindow(Handle);Activate();web.Focus();if(GetAncestor(GetForegroundWindow(),2)!=Handle){padMode=false;return;}}
  else if(gameHandle!=IntPtr.Zero)SetForegroundWindow(gameHandle);
  if(padMode)SetProp(Handle,"BloodborneMapInputCaptureV1",(IntPtr)1);else RemoveProp(Handle,"BloodborneMapInputCaptureV1");
  Post(new{action="gamepad-mode",active=padMode});
 }
 void PollPad(){
  var foreground=GetAncestor(GetForegroundWindow(),2);if(foreground!=Handle&&foreground!=gameHandle){pads.Interval=150;if(padMode){padMode=false;RemoveProp(Handle,"BloodborneMapInputCaptureV1");Post(new{action="gamepad-mode",active=false});}previousButtons=0;layerInput.Reset();return;}
  pads.Interval=padMode?33:50;
  if(!pad.TryRead(out var state)){previousButtons=0;layerInput.Reset();if(padMode)SetPadMode(false);return;}
  ushort pressed=(ushort)(state.Buttons&~previousButtons);previousButtons=state.Buttons;
  if((pressed&GamepadReader.TouchpadToggle)!=0)ToggleCompact();
  bool chord=(state.Buttons&(GamepadReader.Start|GamepadReader.Back))==(GamepadReader.Start|GamepadReader.Back)&&(pressed&(GamepadReader.Start|GamepadReader.Back))!=0;
  if((pressed&GamepadReader.SpecialToggle)!=0||chord){SetPadMode(!padMode);return;}
  // Explicitly requested read-only layer browsing is available in bbhost too.
  // Full stick/button map mode retains its input-isolation requirement.
  // Establish a baseline after show/focus/reconnect; a held key cannot switch.
  int layerDirection=layerInput.Read(state.Buttons,Visible&&frontendReady);
  if(layerDirection!=0)Command(layerDirection>0?"layer-up":"layer-down");
  if(!padMode)return;
  if((pressed&GamepadReader.B)!=0){SetPadMode(false);return;}
  if((pressed&GamepadReader.LeftShoulder)!=0)Command("previous");if((pressed&GamepadReader.RightShoulder)!=0)Command("next");
  if(state.LeftX!=0||state.LeftY!=0||state.RightX!=0||state.RightY!=0||state.LeftTrigger!=0||state.RightTrigger!=0||pressed!=0)
   Post(new{action="gamepad",x=state.LeftX,y=state.LeftY,panX=state.RightX,panY=state.RightY,zoom=state.LeftTrigger-state.RightTrigger,buttons=pressed});
 }
}
