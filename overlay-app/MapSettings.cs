using System.Text.Json;

namespace BloodborneMap;

// Optional user configuration stays beside the executable and out of Git.
sealed class MapSettings {
 public string? SaveDirectory {get;set;}
 public string? BbhostSaveDirectory {get;set;}
 public string? BbportSaveDirectory {get;set;}
 static readonly MapSettings settings=Load();
 static MapSettings Load(){try{return JsonSerializer.Deserialize<MapSettings>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"settings.json")),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??new();}catch(IOException){}catch(UnauthorizedAccessException){}catch(JsonException){}return new();}
 public static string? ResolveSaveDirectory(string host,string? executable){
  string? configured=Environment.GetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY")??settings.SaveDirectory??(host=="bbhost"?settings.BbhostSaveDirectory:settings.BbportSaveDirectory);
  if(!string.IsNullOrWhiteSpace(configured))return Path.GetFullPath(Environment.ExpandEnvironmentVariables(configured),AppContext.BaseDirectory);
  if(executable==null)return null;
  string directory=Path.GetDirectoryName(executable)!;
  if(host=="bbhost")return Path.Combine(directory,"data","saves","SPRJ0005");
  string userDirectory=Environment.GetEnvironmentVariable("BB_USER_DIR")??Path.Combine(directory,"user");
  return Path.Combine(userDirectory,"savedata","1","CUSA00207","SPRJ0005");
 }
}
