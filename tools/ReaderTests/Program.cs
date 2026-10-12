using System.Text.Json;
using BloodborneMap;
// Optional private capture; default uses an invented two-step straight walk.
using var document=JsonDocument.Parse(args.Length>0?File.ReadAllText(args[0]):"""
[{"matrix":[1,0,0,0,0,1,0,0,0,0,1,0],"current":[0,0,0]},
 {"matrix":[1,0,0,0,0,1,0,0,0,0,1,-1],"current":[0,0,-1]}]
""");
var rows=document.RootElement.EnumerateArray().ToArray();
byte[] Bytes(float[] f)=>f.SelectMany(BitConverter.GetBytes).ToArray();
void Check(bool condition,string message){if(!condition)throw new Exception(message);}
byte[] entry=[0x55,0x48,0x89,0xe5,0x41,0x57,0x41,0x56,0x53,0x50,0x48,0x89,0xf3,0x44,0x8b,0x37];
byte[] reference=[0x4c,0x8d,0x3d,0x8e,0xb9,0x31,0x04];
Func<ulong,int,byte[]> Memory(ulong at,bool validRef=true)=>(address,length)=>address==at+0xa0?entry:address==at+0x1222ee3&&validRef?reference:[];
Check(BloodborneReader.FindImage("bbhost",Memory(0x300000000))==0x300000000,"bbhost relocated image rejected");
Check(BloodborneReader.FindImage("bb-probe-phase4-stable",Memory(0x800000000))==0x800000000,"bbport image rejected");
Check(BloodborneReader.FindImage("bbhost",Memory(0x300000000,false))==0,"Partial signature accepted");
Check(BloodborneReader.FindImage("bbhost",Memory(0x800000000))==0,"Wrong host layout accepted");
Check(BloodborneReader.FindImage("unrelated",Memory(0x300000000))==0,"Unrelated process accepted");
Check(BloodborneReader.FindImage("bbhost",(_,_)=>[])==0,"Unreadable image accepted");
int movementChecks=0;
for(int i=0;i<rows.Length;i++){
 var row=rows[i];var f=row.GetProperty("matrix").EnumerateArray().Select(x=>x.GetSingle()).ToArray();
 Check(BloodborneReader.DecodeTransform(Bytes(f),out var p,out float yaw),"Real transform rejected");
 var expected=row.GetProperty("current").EnumerateArray().Select(x=>x.GetSingle()).ToArray();
 Check(p.SequenceEqual(expected),"Wrong translation offsets");
 if(i+1<rows.Length){var next=rows[i+1].GetProperty("current").EnumerateArray().Select(x=>x.GetSingle()).ToArray();float dx=next[0]-p[0],dz=next[2]-p[2],length=MathF.Sqrt(dx*dx+dz*dz);if(length>.1f){Check((dx*MathF.Sin(yaw)+dz*MathF.Cos(yaw))/length>.95f,"Forward arrow disagrees with observed walking direction");movementChecks++;}}
 f[0]=float.NaN;Check(!BloodborneReader.DecodeTransform(Bytes(f),out _,out _),"Non-finite matrix accepted");
}
Check(!BloodborneReader.DecodeTransform(new byte[48],out _,out _),"Zero transform accepted");
Check(!BloodborneReader.DecodeTransform(new byte[47],out _,out _),"Short read accepted");
Check(movementChecks>0,"No movement evidence");
Console.WriteLine($"PASS: {rows.Length} captured live transforms; {movementChecks} walking-direction checks; invalid/short matrices rejected.");
