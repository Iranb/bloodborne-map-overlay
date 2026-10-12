using System.Globalization;

namespace BloodborneMap;

static class AppLanguage {
 static readonly string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BloodborneMap","language.txt");
 public static bool English {get;private set;}=Load();
 static bool Load(){try{if(File.Exists(path))return File.ReadAllText(path).Trim()=="en";}catch(IOException){}catch(UnauthorizedAccessException){}return !CultureInfo.CurrentUICulture.Name.StartsWith("zh",StringComparison.OrdinalIgnoreCase);}
 public static string Text(string zh,string en)=>English?en:zh;
 public static void Set(bool english){if(English==english&&File.Exists(path))return;English=english;try{Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.WriteAllText(path,english?"en":"zh");}catch(IOException){}catch(UnauthorizedAccessException){}}
}
