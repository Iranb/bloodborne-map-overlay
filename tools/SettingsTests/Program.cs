using BloodborneMap;
void Check(bool value,string message){if(!value)throw new Exception(message);}
string? saved=Environment.GetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY"),user=Environment.GetEnvironmentVariable("BB_USER_DIR");
try{
 Environment.SetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY",null);Environment.SetEnvironmentVariable("BB_USER_DIR",null);
 Check(MapSettings.ResolveSaveDirectory("bbhost",@"C:\Game\bbhost.exe")==@"C:\Game\data\saves\SPRJ0005","bbhost discovery");
 Check(MapSettings.ResolveSaveDirectory("bbport",@"C:\Game\bb-probe.exe")==@"C:\Game\user\savedata\1\CUSA00207\SPRJ0005","bb-probe discovery");
 Environment.SetEnvironmentVariable("BB_USER_DIR",@"C:\CustomUser");
 Check(MapSettings.ResolveSaveDirectory("bbport",@"C:\Game\bb-probe.exe")==@"C:\CustomUser\savedata\1\CUSA00207\SPRJ0005","BB_USER_DIR override");
 Environment.SetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY",@"C:\SharedSave");
 Check(MapSettings.ResolveSaveDirectory("bbhost",null)==@"C:\SharedSave"&&MapSettings.ResolveSaveDirectory("bbport",null)==@"C:\SharedSave","explicit override priority");
 Environment.SetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY","relative-save");
 Check(MapSettings.ResolveSaveDirectory("bbhost",null)==Path.Combine(AppContext.BaseDirectory,"relative-save"),"relative path resolution");
 Environment.SetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY",null);
 Check(MapSettings.ResolveSaveDirectory("bbport",null)==null,"no machine-specific fallback");
 Check(AppLanguage.Text("中文","English")== (AppLanguage.English?"English":"中文"),"native language selection");
 Console.WriteLine("PASS: 7 portable save-path and native language checks");
}finally{Environment.SetEnvironmentVariable("BLOODBORNE_SAVE_DIRECTORY",saved);Environment.SetEnvironmentVariable("BB_USER_DIR",user);}
