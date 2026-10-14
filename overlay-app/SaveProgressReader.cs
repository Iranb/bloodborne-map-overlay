using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BloodborneMap;

// Reads completed autosaves only. No save is opened for writing.
sealed class SaveProgressReader {
 string lastDelivery="";
 internal sealed record Snapshot(int schemaVersion,string name,string slot,string saveSet,string[] items,uint[] runes,InventoryEntry[] inventory,string[] bosses,string savedAt);
 readonly Dictionary<string,(long stamp,Snapshot snapshot)> knownFiles=new();
 (string name,(int offset,int mask)[] flags)[]? bossFlags;
 readonly string bossFlagsPath;
 public SaveProgressReader(string? bossFlagsPath=null){this.bossFlagsPath=bossFlagsPath??Path.Combine(AppContext.BaseDirectory,"web/data/boss-flags.json");}
 public long BytesRead {get;private set;}
 public long SnapshotsRead {get;private set;}
 public long CacheHits {get;private set;}
 Snapshot? Deliver(string path,Snapshot snapshot,bool force){
  string key=path+JsonSerializer.Serialize(snapshot);
  if(!force&&key==lastDelivery)return null;lastDelivery=key;return snapshot;
 }
 byte[] ReadFile(string path){using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);if(stream.Length!=1310720)throw new IOException("Save size changed");var b=new byte[1310720];stream.ReadExactly(b);BytesRead+=b.Length;return b;}
 public Snapshot? Read(string? name,string? saveDirectory=null,bool force=false,string? slot=null){try{
  string root=saveDirectory??MapSettings.ResolveSaveDirectory("bbport",null)??"";
  if(root.Length==0||!Directory.Exists(root))return null;
  string saveSet=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar).ToUpperInvariant())))[..16];
  foreach(var file in new DirectoryInfo(root).GetFiles("userdata000?").OrderByDescending(f=>f.LastWriteTimeUtc)){
   if(file.Length!=1310720||(slot!=null&&file.Name!=slot))continue;
   if(knownFiles.TryGetValue(file.FullName,out var known)&&known.stamp==file.LastWriteTimeUtc.Ticks){CacheHits++;if(name!=null&&known.snapshot.name!=name)continue;return Deliver(file.FullName,known.snapshot,force);}
   byte[] b=ReadFile(file.FullName);
   var inventory=SaveInventory.Decode(b);if(inventory==null)continue;
   // Reject a file if a writer changed it while it was being read.
   if(!b.AsSpan().SequenceEqual(ReadFile(file.FullName)))return null;
   var currentStamp=File.GetLastWriteTimeUtc(file.FullName).Ticks;if(currentStamp!=file.LastWriteTimeUtc.Ticks)return null;
   SnapshotsRead++;
   var dead=new List<string>();
   if(bossFlags==null&&File.Exists(bossFlagsPath)){
    using var flags=JsonDocument.Parse(File.ReadAllText(bossFlagsPath));
    bossFlags=flags.RootElement.EnumerateArray().Select(boss=>(boss.GetProperty("name").GetString()!,boss.GetProperty("flags").EnumerateArray().Select(f=>(f.GetProperty("rel_offset").GetInt32(),f.GetProperty("dead_value").GetInt32())).ToArray())).ToArray();
   }
   foreach(var boss in bossFlags??[]){
    bool yes=boss.flags.Length>0;
    foreach(var f in boss.flags){int at=inventory.UserOffset+68545+f.offset;if(f.mask==0||at<0||at>=b.Length||(b[at]&f.mask)!=f.mask)yes=false;}
    if(yes)dead.Add(boss.name);
   }
   var snapshot=new Snapshot(2,inventory.Name,file.Name,saveSet,inventory.Entries.Where(x=>!x.key.StartsWith("rune:")&&!x.key.StartsWith("gem:")).Select(x=>x.key).ToArray(),inventory.Entries.Where(x=>x.key.StartsWith("rune:")).Select(x=>uint.Parse(x.key[5..])).ToArray(),inventory.Entries,dead.Order().ToArray(),file.LastWriteTimeUtc.ToString("O"));
   knownFiles[file.FullName]=(currentStamp,snapshot);
   if(name!=null&&snapshot.name!=name)continue;
   return Deliver(file.FullName,snapshot,force);
  }
 }catch(IOException){}catch(UnauthorizedAccessException){}catch(ArgumentException){}catch(JsonException){}return null;}
}
