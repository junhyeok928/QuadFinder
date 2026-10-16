using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Web.Script.Serialization;

// Metadata enumeration only: no file contents, writes, ACL changes or shell commands.
class IndexBridge {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct FindData {
    public uint attributes; public System.Runtime.InteropServices.ComTypes.FILETIME created,accessed,modified;
    public uint high,low,reserved0,reserved1;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string name;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)] public string alternate;
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstFileEx(string path,int level,out FindData data,int search,IntPtr filter,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextFile(IntPtr handle,out FindData data);
  [DllImport("kernel32.dll")] static extern bool FindClose(IntPtr handle);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string path);
  static double Time(System.Runtime.InteropServices.ComTypes.FILETIME value){long file=((long)(uint)value.dwHighDateTime<<32)|(uint)value.dwLowDateTime;return file==0?0:(file-116444736000000000L)/10000.0;}
  static int Main(string[] args){
    Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
    Stream stream=null;TextReader reader=Console.In;TextWriter writer=Console.Out;
    try{
      if(args.Length==2&&args[0]=="--pipe") {var pipe=new NamedPipeClientStream(".",args[1],PipeDirection.InOut);pipe.Connect(60000);stream=pipe;reader=new StreamReader(pipe,new UTF8Encoding(false));writer=new StreamWriter(pipe,new UTF8Encoding(false)){AutoFlush=true};}
      var json=new JavaScriptSerializer(){MaxJsonLength=67108864};string line;
      while((line=reader.ReadLine())!=null){
        try{
          var input=json.Deserialize<Dictionary<string,object>>(line);string mode=(string)input["mode"];
          if(mode=="hello"){writer.WriteLine(json.Serialize(new {ok=true,value=new {elevated=new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)}}));continue;}
          if(mode!="list"&&mode!="stat")throw new Exception("Unsupported index request");
          // Framework Path.GetFullPath/Combine enforce MAX_PATH even when Win32 supports long paths.
          string directory=((string)input["path"]).Replace('/','\\');
          if(directory.Length<3||!Char.IsLetter(directory[0])||directory[1]!=':'||directory[2]!='\\'||directory.Substring(2).IndexOfAny(new char[]{':','*','?','"','<','>','|','\0'})>=0)throw new Exception("Local absolute paths only");
          foreach(string part in directory.Substring(3).Split('\\'))if(part=="."||part=="..")throw new Exception("Normalized paths only");
          string root=directory.Substring(0,3);
          if(GetDriveType(root)!=2&&GetDriveType(root)!=3)throw new Exception("Local drives only");
          string pattern="\\\\?\\"+directory.TrimEnd('\\')+(mode=="stat"?"":"\\*");FindData data;IntPtr handle=FindFirstFileEx(pattern,1,out data,0,IntPtr.Zero,2);
          if(handle==new IntPtr(-1)){int error=Marshal.GetLastWin32Error();if(error==2&&mode=="list"){writer.WriteLine(json.Serialize(new {ok=true,value=new {entries=new object[0]}}));continue;}writer.WriteLine(json.Serialize(new {ok=false,code=error,error=new System.ComponentModel.Win32Exception(error).Message}));continue;}
          // Stream pages so a single large directory does not require a huge JSON response.
          var entries=new List<object>();try{
            if(mode=="stat"){writer.WriteLine(json.Serialize(new {ok=true,value=new {directory=(data.attributes&16)!=0,link=(data.attributes&1024)!=0,size=(double)data.high*4294967296.0+data.low,modified=Time(data.modified),created=Time(data.created),accessed=Time(data.accessed)}}));continue;}
            do{if(data.name=="."||data.name=="..")continue;string full=directory.TrimEnd('\\')+"\\"+data.name;
              entries.Add(new {name=data.name,path=full,parent=directory,directory=(data.attributes&16)!=0,link=(data.attributes&1024)!=0,size=(double)data.high*4294967296.0+data.low,modified=Time(data.modified),created=Time(data.created),accessed=Time(data.accessed),hidden=(data.attributes&2)!=0,system=(data.attributes&4)!=0,extension=Path.GetExtension(data.name).ToLowerInvariant()});
              if(entries.Count>=512){writer.WriteLine(json.Serialize(new {ok=true,page=true,value=new {entries=entries}}));entries.Clear();}
            }while(FindNextFile(handle,out data));
            int error=Marshal.GetLastWin32Error();if(error!=18)throw new System.ComponentModel.Win32Exception(error);
          }finally{FindClose(handle);}
          writer.WriteLine(json.Serialize(new {ok=true,value=new {entries=entries}}));
        }catch(Exception error){writer.WriteLine(json.Serialize(new {ok=false,error=error.Message}));}
      }
      return 0;
    }finally{if(stream!=null)stream.Dispose();}
  }
}
