using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace BloodborneMap;

// Local v1.09 guest layout: independently derived from the ELF's WorldChrMan
// assertion references and checked against this machine's live bb-probe process.
// No injection, code patches, memory writes, or unbounded address-space scans.
sealed class BloodborneReader : IDisposable {
 const ulong WorldOffset=0x553e878, CameraOffset=0x553e8d0;
 ulong Image;
 public string HostKind {get;private set;}="";
 public string? SaveDirectory {get;private set;}
 IntPtr handle; int pid;
 public int ProcessId=>pid;
 public long ReadCalls {get;private set;}
 public long ReadBytes {get;private set;}
 public bool IsAlive=>handle!=IntPtr.Zero&&GetExitCodeProcess(handle,out var code)&&code==259;
 public bool InputGuard {get;private set;}
 public string Status {get;private set;}="等待 Bloodborne";
 public string StatusEn=>Status switch {
  "等待 Bloodborne"=>"Waiting for Bloodborne", "無法唯讀連接遊戲"=>"Could not attach to game for reading",
  "目前遊戲版本尚未驗證，停止定位"=>"Unsupported game layout; tracking stopped",
  "等待有效角色資料"=>"Waiting for valid character data", "等待角色載入"=>"Waiting for character to load",
  "等待角色即時變換"=>"Waiting for live character transform",
  _=>Status.Replace("已連接 ","Connected to ").Replace("唯讀即時定位 · ","Read-only tracking · ")
 };
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern unsafe bool ReadProcessMemory(IntPtr h,IntPtr at,byte* data,nuint size,out nuint read);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 unsafe bool ReadInto(ulong at,Span<byte> b){
  if(handle==IntPtr.Zero||at<0x10000||at>0x7fffffffffff)return false;
  ReadCalls++;ReadBytes+=b.Length;
  fixed(byte* buffer=b)return ReadProcessMemory(handle,(IntPtr)at,buffer,(nuint)b.Length,out var n)&&n==(nuint)b.Length;
 }
 byte[] Read(ulong at,int size){var b=new byte[size];return ReadInto(at,b)?b:[];}
 ulong Q(ulong at){Span<byte> b=stackalloc byte[8];return ReadInto(at,b)?BitConverter.ToUInt64(b):0;}
 internal static bool IsGameProcess(string name)=>name.Equals("bbhost",StringComparison.OrdinalIgnoreCase)||name.Equals("bb-probe",StringComparison.OrdinalIgnoreCase)||name.StartsWith("bb-probe-",StringComparison.OrdinalIgnoreCase);
 internal static ulong FindImage(string name,Func<ulong,int,byte[]> read){
  if(!IsGameProcess(name))return 0;
  // Only known host load addresses, never a scan of the game's address space.
  ulong[] bases=name.Equals("bbhost",StringComparison.OrdinalIgnoreCase)?[0x300000000,0x400000]:[0x800000000];
  byte[] entry=[0x55,0x48,0x89,0xe5,0x41,0x57,0x41,0x56,0x53,0x50,0x48,0x89,0xf3,0x44,0x8b,0x37];
  byte[] worldRef=[0x4c,0x8d,0x3d,0x8e,0xb9,0x31,0x04];
  foreach(ulong candidate in bases)
   if(read(candidate+0xa0,entry.Length).SequenceEqual(entry)&&read(candidate+0x1222ee3,worldRef.Length).SequenceEqual(worldRef))return candidate;
  return 0;
 }
 public bool Attach(Process process){
  if(pid==process.Id&&handle!=IntPtr.Zero)return true;
  Dispose();handle=OpenProcess(0x410,false,process.Id);
  if(handle==IntPtr.Zero){Status="無法唯讀連接遊戲";return false;}
  // Refuse an unknown guest image even when the host executable name matches.
  Image=FindImage(process.ProcessName,Read);
  if(Image==0){
   Dispose();Status="目前遊戲版本尚未驗證，停止定位";return false;
  }
  pid=process.Id;HostKind=process.ProcessName.Equals("bbhost",StringComparison.OrdinalIgnoreCase)?"bbhost":"bbport";Status=$"已連接 {HostKind} / Bloodborne v1.09";
  string? executable=null;try{executable=process.MainModule?.FileName;}catch{}
  SaveDirectory=MapSettings.ResolveSaveDirectory(HostKind,executable);
  // Optional host capability: verified marker in the actually loaded PE module.
  InputGuard=false;
  if(HostKind=="bbport")try{var module=process.MainModule!;byte[] needle=Encoding.Unicode.GetBytes("BloodborneMapInputCaptureV1");for(int off=0;off<module.ModuleMemorySize;off+=65536){var block=Read((ulong)module.BaseAddress+ (ulong)off,Math.Min(65536+needle.Length,module.ModuleMemorySize-off));if(block.AsSpan().IndexOf(needle)>=0){InputGuard=true;break;}}}catch{}
  return true;
 }
 public LivePosition? Sample(){
  Status="等待有效角色資料";
  if(handle==IntPtr.Zero||Image==0)return null;
  Span<byte> globals=stackalloc byte[0x60],worldHeader=stackalloc byte[0x68],playerHeader=stackalloc byte[0x60];
  if(!ReadInto(Image+WorldOffset,globals))return null;
  ulong world=BitConverter.ToUInt64(globals);
  if(!ReadInto(world,worldHeader)||BitConverter.ToUInt64(worldHeader)!=Image+0x53301f0){Status="等待角色載入";return null;}
  ulong player=BitConverter.ToUInt64(worldHeader[0x60..]);
  if(!ReadInto(player,playerHeader)||BitConverter.ToUInt64(playerHeader)!=Image+0x538f310){Status="等待角色載入";return null;}
  // ChrIns +0xc0/+0xd4 retain an old placement and heading during movement.
  // ChrCtrl (owned by this player) has the current row-major 3x4 world transform.
  ulong controller=BitConverter.ToUInt64(playerHeader[0x58..]);
  Span<byte> ctrl=stackalloc byte[0xc0],fields=stackalloc byte[0x3c],info=stackalloc byte[0x40];
  if(!ReadInto(controller,ctrl)||BitConverter.ToUInt64(ctrl)!=Image+0x5370610||BitConverter.ToUInt64(ctrl[8..])!=player){Status="等待角色即時變換";return null;}
  if(!ReadInto(player+0x3c0,fields))return null;
  var id=fields[0x38..];ulong data=BitConverter.ToUInt64(fields);
  if(!ReadInto(data+0x90,info)||!DecodeTransform(ctrl[0x90..],out var p,out float yaw))return null;
  if(p.Any(x=>!float.IsFinite(x)||Math.Abs(x)>20000)||!float.IsFinite(yaw)||id[3]<10||id[3]>40)return null;
  var name=Encoding.Unicode.GetString(info.Slice(0x18,32)).Split('\0')[0];
  if(string.IsNullOrWhiteSpace(name))return null;
  ulong cam=Q(Q(BitConverter.ToUInt64(globals[(int)(CameraOffset-WorldOffset)..])+0x68)+0x60);Span<byte> angle=stackalloc byte[4];
  float? cameraYaw=ReadInto(cam+0x144,angle)?BitConverter.ToSingle(angle):null;
  if(cameraYaw is float cy&&(!float.IsFinite(cy)||Math.Abs(cy)>Math.PI*2))cameraYaw=null;
  // Recheck pointer/map after sampling: discard a mixed snapshot during travel.
  Span<byte> checkId=stackalloc byte[4];
  if(Q(Image+WorldOffset)!=world||Q(world+0x60)!=player||Q(player+0x58)!=controller||Q(controller+8)!=player||!ReadInto(player+0x3f8,checkId)||!checkId.SequenceEqual(id))return null;
  Status=$"唯讀即時定位 · {HostKind}";
  return new LivePosition($"m{id[3]:00}_{id[2]:00}_{id[1]:00}_00",p,yaw,cameraYaw,name,BitConverter.ToUInt32(info),pid);
 }
 internal static bool DecodeTransform(ReadOnlySpan<byte> b,out float[] p,out float yaw){
  p=[];yaw=0;if(b.Length!=48)return false;
  Span<float> f=stackalloc float[12];for(int i=0;i<12;i++){f[i]=BitConverter.ToSingle(b.Slice(i*4,4));if(!float.IsFinite(f[i]))return false;}
  // Reject torn/invalid rotation matrices instead of displaying stale placement.
  for(int row=0;row<3;row++){float length=0;for(int k=0;k<3;k++)length+=f[row*4+k]*f[row*4+k];if(Math.Abs(length-1)>.08f)return false;}
  for(int a=0;a<3;a++)for(int c=a+1;c<3;c++){float dot=0;for(int k=0;k<3;k++)dot+=f[a*4+k]*f[c*4+k];if(Math.Abs(dot)>.08f)return false;}
  p=[f[3],f[7],f[11]];if(p.Any(v=>Math.Abs(v)>20000))return false;
  // Bloodborne's character forward is local -Z. Verified against consecutive
  // live movement samples; using +Z points the arrow backwards.
  yaw=MathF.Atan2(-f[2],-f[10]);return true;
 }
 public void Dispose(){if(handle!=IntPtr.Zero)CloseHandle(handle);handle=IntPtr.Zero;pid=0;Image=0;HostKind="";SaveDirectory=null;InputGuard=false;}
}
record LivePosition(string mapId,float[] p,float yaw,float? cameraYaw,string name,uint level,int pid);
