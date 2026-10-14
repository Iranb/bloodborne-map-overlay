using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BloodborneMap;

int checks=0;
void Check(bool yes,string message){checks++;if(!yes)throw new Exception(message);}
const int user=200000;
byte[] Fixture(){var b=new byte[1310720];Encoding.Unicode.GetBytes("test").CopyTo(b,user+1);"FACE"u8.CopyTo(b.AsSpan(user+34497));return b;}
void U(byte[] b,int pos,uint value)=>BinaryPrimitives.WriteUInt32LittleEndian(b.AsSpan(pos,4),value);
void Entry(byte[] b,int pos,uint handle,uint id,uint qty){U(b,pos+4,handle);U(b,pos+8,id);U(b,pos+12,qty);}
void Rune(byte[] b,int pos,uint handle,uint effect){U(b,pos,handle);U(b,pos+8,2);U(b,pos+12,1);U(b,pos+16,effect);}
var blob=Fixture();
Rune(blob,84,0xc0800001,100001);
// Orphan objects must not establish ownership. A gap/weapon before another rune must not end the scan.
Rune(blob,124,0xc0800002,100002);U(blob,172,0x80800001);Rune(blob,232,0xc0800003,100003);
Entry(blob,user+469,0xb0000001,0x400003e8,20);
Entry(blob,user+469+16,0x80800001,3000307,1);
Entry(blob,user+469+32,0x90800001,0x1016e360,1);
Entry(blob,user+469+48,0xc0800001,0xc0800001,1);
Entry(blob,user+469+64,0xb0000002,0x400007d0,0);
Entry(blob,user+469+80,0x80800002,3010205,1);
Entry(blob,user+469+96,0xc0800003,0xc0800003,1);
Entry(blob,user+469+112,0,3000000,1); // Not a weapon handle.
Entry(blob,user+469+128,0x80800004,1000000,4); // Empty hand slots.
Entry(blob,user+469+144,0x90800004,0x100dbba0,1); // Empty attire slot.
Entry(blob,user+469+1983*16,0xb0000003,0x40000bb8,2);
Entry(blob,user+32201+137*16,0xb0000004,0x40000fa0,1);
Entry(blob,user+34737,0xb0000005,0x400003e8,80);
Entry(blob,user+34737+1983*16,0xc0800001,0xc0800001,1);
var decoded=SaveInventory.Decode(blob)!;
var counts=decoded.Entries.ToDictionary(x=>x.key);
Check(decoded.Name=="test","character name");
Check(counts["4:1000"].bag==20&&counts["4:1000"].storage==80,"bag and storage separated");
Check(counts["rune:100001"].bag==1&&counts["rune:100001"].storage==1,"referenced rune counts");
Check(!counts.ContainsKey("rune:100002"),"orphan rune excluded");
Check(counts.ContainsKey("rune:100003"),"mixed registry and gap");
Check(counts["0:3000000"].bag==1&&counts["0:3010000"].bag==1,"reinforcement stripped, variant retained, unknown handle excluded");
Check(counts["1:1500000"].bag==1,"attire ID decoded");
Check(!counts.ContainsKey("4:2000"),"empty inventory excluded");
Check(!counts.ContainsKey("0:1000000")&&!counts.ContainsKey("1:900000"),"empty equipment defaults excluded");
Check(counts["4:3000"].bag==2&&counts["4:4000"].bag==1,"last bag and key slots included");
Check(SaveInventory.Decode(new byte[100])==null&&SaveInventory.Decode(new byte[1310720])==null,"truncated and unknown layouts rejected");
var root=Path.Combine(Path.GetTempPath(),"BloodborneMap-save-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
var file=Path.Combine(root,"userdata0000");File.WriteAllBytes(file,blob);
var flags=Path.Combine(root,"boss-flags.json");File.WriteAllText(flags,"[]");
var reader=new SaveProgressReader(flags);
var first=reader.Read("test",root)!;
Check(first.schemaVersion==2&&first.inventory.Length==counts.Count,"v2 inventory payload");
Check(reader.Read("test",root)==null&&reader.CacheHits==1,"unchanged snapshots cached");
Check(reader.Read("test",root,true)!=null,"forced delivery");
var before=SHA256.HashData(File.ReadAllBytes(file));
reader.Read("test",root,true);
Check(before.SequenceEqual(SHA256.HashData(File.ReadAllBytes(file))),"read does not modify save");
Entry(blob,user+469,0xb0000001,0x400003e8,19);File.WriteAllBytes(file,blob);File.SetLastWriteTimeUtc(file,DateTime.UtcNow.AddSeconds(2));
Check(reader.Read("test",root)!.inventory.Single(x=>x.key=="4:1000").bag==19,"quantity-only changes delivered");
Check(reader.Read("other",root)==null&&reader.Read(null,root,true,"userdata0001")==null,"character and slot filters");
Check(reader.Read(null,root,true)!.name=="test","offline latest snapshot");
Console.WriteLine($"PASS: {checks} save inventory and snapshot checks");
if(args.Length==3){
 var actual=new SaveProgressReader(args[1]).Read(null,args[0],true);
 Check(actual!=null,"actual save decoding");File.WriteAllText(args[2],JsonSerializer.Serialize(actual));
 Console.WriteLine($"Actual snapshot: {actual!.inventory.Length} inventory IDs, {actual.runes.Length} held rune effects, {actual.bosses.Length} bosses");
}
