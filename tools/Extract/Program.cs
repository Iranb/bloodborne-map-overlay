// Offline local-game extraction. GPL-3.0; see LICENSE.
extern alias legacy;
using SoulsFormats;
using HKX = legacy::SoulsFormats.HKX;
using System.Numerics;
using System.Text;
using System.Text.Json;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
if (args.Length < 2) throw new ArgumentException("Extract <dvdroot_ps4> <output-directory> [map-id]");
string game = Path.GetFullPath(args[0]), output = Path.GetFullPath(args[1]);
Directory.CreateDirectory(output);
var json = new JsonSerializerOptions { IncludeFields = true };
float[] Vec(Vector3 v) => [v.X, v.Y, v.Z];
string Base(string name) => Path.GetFileName(name.Replace('\\', '/')).Split('.')[0];
if (args.Length > 2 && args[2] == "--npc-only") {
    // Patch map variants (_01) contain NPCs added in later game revisions.
    var npcMaps = new Dictionary<string, object>();
    foreach (var group in Directory.GetFiles(Path.Combine(game,"map/mapstudio"),"*.msb.dcx")
             .Where(f => !Path.GetFileName(f).StartsWith("m29") &&
                 (Path.GetFileName(f).EndsWith("_00.msb.dcx") || Path.GetFileName(f).EndsWith("_01.msb.dcx")))
             .GroupBy(f => Path.GetFileName(f)[..9])) {
        string file = group.OrderBy(f => f).Last();
        var m = MSBB.Read(file);
        npcMaps[group.Key+"_00"] = new { source=Path.GetFileName(file),
            parts=m.Parts.Enemies.Select(p => new {p.Name,p.ModelName,p.EntityID,p=Vec(p.Position),npc=p.NPCParamID,talk=p.TalkID}) };
    }
    File.WriteAllText(Path.Combine(output,"npc-parts.json"),JsonSerializer.Serialize(npcMaps,json));
    Console.WriteLine($"Exported latest NPC placements from {npcMaps.Count} maps.");
    return;
}
var maps = new Dictionary<string, object>();
var errors = new List<string>();
foreach (var file in Directory.GetFiles(Path.Combine(game,"map/mapstudio"),"*.msb.dcx").Order()) {
    string id = Path.GetFileName(file).Split('.')[0];
    if (!id.EndsWith("_00") || id.StartsWith("m29") || (args.Length > 2 && id != args[2])) continue;
    var m = MSBB.Read(file);
    maps[id] = new {
        parts = m.Parts.GetEntries().Select(p => new {p.Name, p.ModelName, p.EntityID, p=Vec(p.Position), r=Vec(p.Rotation), type=p.GetType().Name,
            npc=p is MSBB.Part.EnemyBase e ? e.NPCParamID : -1, talk=p is MSBB.Part.EnemyBase e2 ? e2.TalkID : -1}),
        treasures = m.Events.Treasures.Select(t => new {t.Name,t.TreasurePartName,t.PartName,t.RegionName,lots=new[]{t.ItemLot1,t.ItemLot2,t.ItemLot3}}),
        regions = m.Regions.GetEntries().Select(r => new {r.Name,r.EntityID,p=Vec(r.Position)}),
        spawns = m.Events.SpawnPoints.Select(s => new{s.Name,s.EntityID,s.SpawnPointName}),
    };
    try {
        string stem = "l"+id[1..], dir = Path.Combine(game,"map",id);
        var binder = BXF4.Read(Path.Combine(dir,stem+".hkxbhd"),Path.Combine(dir,stem+".hkxbdt"));
        var files = binder.Files.ToDictionary(f => Base(f.Name),StringComparer.OrdinalIgnoreCase);
        Console.WriteLine($"{id}: binder {string.Join(", ", files.Keys.Take(3))}; parts {string.Join(", ", m.Parts.Collisions.Take(3).Select(p=>p.ModelName))}");
        var points = new List<float>();
        int loaded=0, missing=0;
        foreach(var part in m.Parts.Collisions) {
            if (part.ModelName.StartsWith("h99")) continue;
            string key=stem+"_"+part.ModelName[1..];
            var f=files.GetValueOrDefault(key) ?? files.Values.FirstOrDefault(f => Base(f.Name).StartsWith(key+"_"));
            if(f==null) {missing++; continue;}
            var hkx=HKX.Read(f.Bytes,HKX.HKXVariation.HKXBloodBorne);
            var rad=part.Rotation*(MathF.PI/180);
            var transform=Matrix4x4.CreateScale(part.Scale)*Matrix4x4.CreateRotationX(rad.X)*Matrix4x4.CreateRotationZ(rad.Z)*Matrix4x4.CreateRotationY(rad.Y)*Matrix4x4.CreateTranslation(part.Position);
            foreach(var shape in hkx.DataSection.Objects.OfType<HKX.FSNPCustomParamCompressedMeshShape>()) {
                var d=shape.GetMeshShapeData();
                var small=d.SmallVertices.GetArrayData()?.Elements;
                var large=d.LargeVertices.GetArrayData()?.Elements;
                var indices=d.VertexIndices.GetArrayData()?.Elements;
                var tris=d.MeshIndices.GetArrayData()?.Elements;
                foreach(var chunk in d.Chunks.GetArrayData().Elements) {
                    Vector3 Vertex(byte i) {
                        var v=i<chunk.VertexIndicesLength
                            ? small![(int)chunk.SmallVerticesBase+i].Decompress(chunk.SmallVertexScale,chunk.SmallVertexOffset)
                            : large![indices![i+chunk.VertexIndicesIndex-chunk.VertexIndicesLength].data].Decompress(d.BoundingBoxMin,d.BoundingBoxMax);
                        return Vector3.Transform(v,transform);
                    }
                    void Tri(byte a,byte b,byte c) {
                        if(a==b || b==c || a==c)return;
                        var va=Vertex(a);var vb=Vertex(b);var vc=Vertex(c);
                        if(!float.IsFinite(va.X+va.Y+va.Z+vb.X+vb.Y+vb.Z+vc.X+vc.Y+vc.Z))throw new InvalidDataException("Non-finite mesh vertex");
                        if(Vector3.Cross(vb-va,vc-va).LengthSquared()<1e-10f)return;
                        points.AddRange(Vec(va));points.AddRange(Vec(vb));points.AddRange(Vec(vc));
                    }
                    for(int i=0;i<chunk.ByteIndicesLength;i++) {
                        var tri=tris![chunk.ByteIndicesIndex+i];
                        Tri(tri.Idx0,tri.Idx1,tri.Idx2);
                        if(tri.Idx2!=tri.Idx3)Tri(tri.Idx0,tri.Idx2,tri.Idx3);
                    }
                }
            }
            loaded++;
        }
        using(var writer=new BinaryWriter(File.Create(Path.Combine(output,id+".mesh")))) foreach(float v in points)writer.Write(v);
        Console.WriteLine($"{id}: {loaded} collision parts, {missing} missing; {points.Count/9:N0} triangles");
        if(points.Count==0)errors.Add(id+": empty geometry");
    } catch(Exception ex) { errors.Add(id+": "+ex);Console.WriteLine(errors[^1]); }
}
var texts=new Dictionary<string,object>();
foreach(string lang in new[]{"zhotw","engus"}) {
    foreach(var file in Directory.GetFiles(Path.Combine(game,"msg",lang),"*.dcx"))
        foreach(var f in BND4.Read(file).Files)
            if(f.Name.EndsWith(".fmg"))texts[lang+"/"+Base(f.Name)]=FMG.Read(f.Bytes).Entries.Where(e=>!string.IsNullOrWhiteSpace(e.Text)).Select(e=>new{e.ID,e.Text});
}
var defs=BND4.Read(Path.Combine(game,"paramdef/paramdef.paramdefbnd.dcx")).Files.Select(f=>PARAMDEF.Read(f.Bytes)).ToDictionary(d=>d.ParamType);
var parameters=new Dictionary<string,object>();
foreach(var f in BND4.Read(Path.Combine(game,"param/gameparam/gameparam.parambnd.dcx")).Files) {
    var name=Base(f.Name);
    if(!new[]{"ItemLotParam","EquipParamGoods","EquipParamWeapon","EquipParamProtector","EquipParamAccessory","NpcParam"}.Contains(name) && !name.StartsWith("Gem") && !name.Contains("Warp"))continue;
    try {var p=PARAM.Read(f.Bytes);p.ApplyParamdef(defs[p.ParamType]);parameters[name]=p.Rows.Select(r=>new{r.ID,r.Name,cells=r.Cells.ToDictionary(c=>c.Def.InternalName,c=>c.Value)});}
    catch(Exception ex){errors.Add("param "+name+": "+ex.Message);}
}
File.WriteAllText(Path.Combine(output,"raw.json"),JsonSerializer.Serialize(new{maps,parameters,texts,errors},json));
Console.WriteLine($"Exported {maps.Count} maps, {parameters.Count} params, {texts.Count} text tables, {errors.Count} errors.");
