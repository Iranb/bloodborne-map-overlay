using System.Text;
using System.Text.Json;

namespace BloodborneMap;

// Reads a completed autosave snapshot only. Does not open any save for writing.
sealed class SaveProgressReader {
 string lastDelivery="";
 sealed record Snapshot(string name,string slot,string[] items,uint[] runes,string[] bosses,string savedAt);
 readonly Dictionary<string,(long stamp,Snapshot snapshot)> knownFiles=new();
 (string name,(int offset,int mask)[] flags)[]? bossFlags;
 public long BytesRead {get;private set;}
 public long SnapshotsRead {get;private set;}
 public long CacheHits {get;private set;}
 Snapshot? Deliver(string path,Snapshot snapshot,bool force){
  string key=path+JsonSerializer.Serialize(new{snapshot.name,snapshot.items,snapshot.runes,snapshot.bosses});
  if(!force&&key==lastDelivery)return null;lastDelivery=key;return snapshot;
 }
 byte[] ReadFile(string path){using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);if(stream.Length!=1310720)throw new IOException("Save size changed");var b=new byte[1310720];stream.ReadExactly(b);BytesRead+=b.Length;return b;}
 public object? Read(string name,string? saveDirectory=null,bool force=false){try{
  string root;
  if(saveDirectory!=null)root=saveDirectory;
  else {root=MapSettings.ResolveSaveDirectory("bbport",null)??"";if(root.Length==0)return null;}
  if(!Directory.Exists(root))return null;
  foreach(var file in new DirectoryInfo(root).GetFiles("userdata000?").OrderByDescending(f=>f.LastWriteTimeUtc)){
   if(file.Length!=1310720)continue;
   if(knownFiles.TryGetValue(file.FullName,out var known)&&known.stamp==file.LastWriteTimeUtc.Ticks){CacheHits++;if(known.snapshot.name!=name)continue;return Deliver(file.FullName,known.snapshot,force);}
   byte[] b=ReadFile(file.FullName);
   int face=b.AsSpan(0xf000).IndexOf("FACE"u8);if(face<0)continue;face+=0xf000;
   int u=face-34497;if(u<0||u+72000>=b.Length)continue;
   string character=Encoding.Unicode.GetString(b,u+1,32).Split('\0')[0];
   // A writer can change this file while we read. Wait until two reads agree.
   if(!b.AsSpan().SequenceEqual(ReadFile(file.FullName)))return null;
   var currentStamp=File.GetLastWriteTimeUtc(file.FullName).Ticks;if(currentStamp!=file.LastWriteTimeUtc.Ticks)return null;
   SnapshotsRead++;
   var items=new HashSet<string>();var runes=new HashSet<uint>();
   uint U(int at)=>BitConverter.ToUInt32(b,at);
   foreach(var (start,count) in new[]{(u+469,1984),(u+32201,138),(u+469+34268,1984)})
    for(int i=start;i+16<=b.Length&&i<start+count*16;i+=16){
     uint id=U(i+8),amount=U(i+12);if(amount==0||amount>9999999)continue;
     if(b[i+7]==0xb0&&b[i+11]==0x40)items.Add("4:"+(id&0xffffff));
     else if(b[i+11]==0x10)items.Add("1:"+(id&0xffffff));
     else if(b[i+11]==0&&id>=1000000&&id<0x10000000)items.Add("0:"+(id-id%10000));
    }
   for(int i=84;i+40<face-34028;i+=40){uint kind=U(i+8),shape=U(i+12);if(kind is not (1 or 2)||shape is not (1 or 2 or 4 or 8 or 63))break;if(kind==2)runes.Add(U(i+16));}
   var dead=new List<string>();
   if(bossFlags==null){
    using var flags=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"web/data/boss-flags.json")));
    bossFlags=flags.RootElement.EnumerateArray().Select(boss=>(boss.GetProperty("name").GetString()!,boss.GetProperty("flags").EnumerateArray().Select(f=>(f.GetProperty("rel_offset").GetInt32(),f.GetProperty("dead_value").GetInt32())).ToArray())).ToArray();
   }
   foreach(var boss in bossFlags){
    bool yes=boss.flags.Length>0;
    foreach(var f in boss.flags){int at=u+68545+f.offset;if(f.mask==0||at<0||at>=b.Length||(b[at]&f.mask)!=f.mask)yes=false;}
    if(yes)dead.Add(boss.name);
   }
   var snapshot=new Snapshot(character,file.Name,items.Order().ToArray(),runes.Order().ToArray(),dead.Order().ToArray(),file.LastWriteTimeUtc.ToString("O"));
   knownFiles[file.FullName]=(currentStamp,snapshot);
   if(character!=name)continue;
   return Deliver(file.FullName,snapshot,force);
  }
 }catch(IOException){}catch(UnauthorizedAccessException){}catch(ArgumentException){}catch(JsonException){}return null;}
}
