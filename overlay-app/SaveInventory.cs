using System.Buffers.Binary;
using System.Text;

namespace BloodborneMap;

// Bloodborne v1.09 save layout. Decode an immutable, completed snapshot only.
// Inventory references establish ownership; the object registry alone does not.
sealed record InventoryEntry(string key, long bag, long storage);
sealed record SaveInventory(string Name, int UserOffset, InventoryEntry[] Entries) {
 internal static SaveInventory? Decode(byte[] bytes) {
  if(bytes.Length!=1310720)return null;
  int face=bytes.AsSpan(0xf000).IndexOf("FACE"u8);
  if(face<0)return null;
  int user=face+0xf000-34497;
  if(user<84||user+72082>=bytes.Length)return null;
  string name=Encoding.Unicode.GetString(bytes,user+1,32).Split('\0')[0];
  if(string.IsNullOrWhiteSpace(name))return null;
  uint U(int at)=>BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(at,4));
  var upgrades=new Dictionary<uint,(uint kind,uint effect)>();
  // The 4096 registry slots have variable widths, including empty slots.
  for(int pos=84,slot=0;slot<4096&&pos+8<=user;slot++) {
   byte tag=bytes[pos+3];int width=tag switch {0x80 or 0x90=>60,0xc0=>40,0=>8,_=>0};
   if(width==0||pos+width>user)break;
   if(tag==0xc0) {
    uint kind=U(pos+8),shape=U(pos+12),effect=U(pos+16);
    if((kind==2&&shape is 1 or 2)||(kind==1&&shape is 1 or 2 or 4 or 8 or 63))
     if(effect!=0&&effect!=uint.MaxValue)upgrades[U(pos)]=(kind,effect);
   }
   pos+=width;
  }
  var counts=new Dictionary<string,(long bag,long storage)>();
  foreach(var (start,slots,stored) in new[]{(user+469,1984,false),(user+32201,138,false),(user+34737,1984,true)}) {
   for(int pos=start;pos<start+slots*16;pos+=16) {
    uint handle=U(pos+4),id=U(pos+8),amount=U(pos+12);
    if(amount==0||amount>9999999)continue;
    string? key=null;
    if(bytes[pos+7]==0xb0&&bytes[pos+11]==0x40)key="4:"+(id&0xffffff);
    else if(bytes[pos+7]==0x90&&bytes[pos+11]==0x10)key="1:"+(id&0xffffff);
    else if(bytes[pos+7]==0x80&&bytes[pos+11]==0&&id>=1000000&&id<0x10000000)key="0:"+(id-id%10000);
    else if(upgrades.TryGetValue(handle,out var upgrade))key=(upgrade.kind==2?"rune:":"gem:")+upgrade.effect;
    // Empty hand/attire slots reference these internal defaults, not bag items.
    if(key is null or "0:1000000" or "1:900000" or "1:901000" or "1:902000" or "1:903000")continue;
    counts.TryGetValue(key,out var c);
    counts[key]=stored?(c.bag,c.storage+amount):(c.bag+amount,c.storage);
   }
  }
  return new(name,user,counts.OrderBy(x=>x.Key,StringComparer.Ordinal).Select(x=>new InventoryEntry(x.Key,x.Value.bag,x.Value.storage)).ToArray());
 }
}
