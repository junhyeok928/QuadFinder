using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Text.RegularExpressions;

// Runs shell extensions out of Electron's process. All input is JSON over stdin.
class ShellBridge : Form {
  static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=16000000};
  readonly Dictionary<uint,string> hostCommands=new Dictionary<uint,string>();
  IContextMenu menu; IContextMenu2 menu2; IContextMenu3 menu3;
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string root);
  [STAThread] static int Main(string[] args){
    SetProcessDPIAware();Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Contains("--menu-server")){
      Application.OleRequired();Console.WriteLine(json.Serialize(new {ready=true}));string line;
      while((line=Console.ReadLine())!=null){
        try{var request=json.Deserialize<Dictionary<string,object>>(line);using(var form=new ShellBridge()){Console.WriteLine(json.Serialize(new {ok=true,value=form.Run(request)}));}}
        catch(Exception error){Console.WriteLine(json.Serialize(new {ok=false,error=error.Message}));}
      }
      return 0;
    }
    try{var input=json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());object result;
      string mode=(string)input["mode"];
      if(mode=="network-drives"||mode=="local-drives"){result=Enumerable.Range(65,26).Select(i=>((char)i)+":\\").Where(p=>mode=="network-drives"?GetDriveType(p)==4:(GetDriveType(p)==3||GetDriveType(p)==2)).ToArray();Console.WriteLine(json.Serialize(new {ok=true,value=result}));return 0;}
      if(mode=="attributes")result=Paths(input).Select(p=>{try{var a=File.GetAttributes(p);return new {path=p,known=true,hidden=(a&FileAttributes.Hidden)!=0,system=(a&FileAttributes.System)!=0,readOnly=(a&FileAttributes.ReadOnly)!=0};}catch{return new {path=p,known=false,hidden=false,system=false,readOnly=false};}}).ToArray();
      else if(mode=="clipboard-write") {var data=new DataObject();var paths=new StringCollection();paths.AddRange(Paths(input));data.SetFileDropList(paths);data.SetData("Preferred DropEffect",new MemoryStream(BitConverter.GetBytes((string)input["kind"]=="move"?2:5)));Clipboard.SetDataObject(data,true,10,50);result=true;}
      else if(mode=="clipboard-read") {var data=ReadClipboard();var files=data!=null&&data.GetDataPresent(DataFormats.FileDrop)?(data.GetData(DataFormats.FileDrop) as string[]??new string[0]):new string[0];var effect=data==null?null:data.GetData("Preferred DropEffect") as MemoryStream;result=new {paths=files,kind=effect!=null&&effect.Length>=4&&(BitConverter.ToInt32(effect.ToArray(),0)&2)!=0?"move":"copy"};}
      else using(var form=new ShellBridge()){result=form.Run(input);}
      Console.WriteLine(json.Serialize(new {ok=true,value=result}));return 0;
    }catch(Exception error){Console.WriteLine(json.Serialize(new {ok=false,error=error.Message}));return 1;}
  }
  static IDataObject ReadClipboard(){for(int attempt=0;;attempt++){try{return Clipboard.GetDataObject();}catch(ExternalException){if(attempt>=9)throw;System.Threading.Thread.Sleep(50);}}}
  static string[] Paths(Dictionary<string,object> input){return ((System.Collections.IEnumerable)input["paths"]).Cast<string>().ToArray();}
  object Run(Dictionary<string,object> input){
    var paths=Paths(input);if(paths.Length<1)throw new Exception("파일을 선택하세요.");
    bool background=input.ContainsKey("background")&&(bool)input["background"];
    if(background&&(string)input["mode"]=="menu"&&!input.ContainsKey("verb")){
      try{var clipboard=ReadClipboard();input["canPaste"]=clipboard!=null&&clipboard.GetDataPresent(DataFormats.FileDrop);}catch(ExternalException){input["canPaste"]=false;}
    }
    bool mixed=!background&&paths.Select(p=>Path.GetDirectoryName(p)??Path.GetPathRoot(p)).Distinct(StringComparer.OrdinalIgnoreCase).Count()>1;
    var pidls=new List<IntPtr>();object shell=null;IntPtr popup=IntPtr.Zero;
    try{
      Guid iid=new Guid("000214E4-0000-0000-C000-000000000046");
      if(background){IShellItem item;Guid itemId=typeof(IShellItem).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(paths[0],IntPtr.Zero,ref itemId,out item));
        try{Guid folderHandler=new Guid("3981E224-F559-11D3-8E3A-00C04F6837D5"),folderId=typeof(IShellFolder).GUID;object obj;item.BindToHandler(IntPtr.Zero,ref folderHandler,ref folderId,out obj);shell=obj;var folder=(IShellFolder)obj;folder.CreateViewObject(Handle,ref iid,out obj);menu=(IContextMenu)obj;}finally{Marshal.ReleaseComObject(item);}
      }else if(!mixed){
        foreach(var path in paths){IntPtr pidl;uint attrs;Marshal.ThrowExceptionForHR(SHParseDisplayName(path,IntPtr.Zero,out pidl,0,out attrs));pidls.Add(pidl);}
        IShellItemArray array;Marshal.ThrowExceptionForHR(SHCreateShellItemArrayFromIDLists((uint)pidls.Count,pidls.ToArray(),out array));shell=array;
        Guid handler=new Guid("3981E225-F559-11D3-8E3A-00C04F6837D5");object obj;array.BindToHandler(IntPtr.Zero,ref handler,ref iid,out obj);menu=(IContextMenu)obj;
      }
      menu2=menu as IContextMenu2;menu3=menu as IContextMenu3;
      popup=CreatePopupMenu();if(background)BuildHostMenu(popup,input);if(mixed){AddHost(popup,"잘라내기(&T)","cut");AddHost(popup,"복사(&C)","copy");AddHost(popup,"삭제(&D)","delete");AddHost(popup,"경로로 복사(&A)","path");}else Marshal.ThrowExceptionForHR(menu.QueryContextMenu(popup,(uint)GetMenuItemCount(popup),1,0x6fff,0x4|0x10|(input.ContainsKey("extended")&&(bool)input["extended"]?0x100u:0u)));
      if(background)for(int i=GetMenuItemCount(popup)-1;i>=0;i--){uint id=GetMenuItemID(popup,i);if(id<1||id>0x6fff)continue;var folderLabel=new StringBuilder(512);GetMenuString(popup,(uint)i,folderLabel,512,0x400);var label=folderLabel.ToString();if(label.StartsWith("새 폴더(")||label.StartsWith("New folder",StringComparison.OrdinalIgnoreCase))DeleteMenu(popup,(uint)i,0x400);}
      if((string)input["mode"]=="warmup")return new {ready=true};
      if((string)input["mode"]=="probe")return new {count=GetMenuItemCount(popup),labels=Labels(popup),verbs=Verbs(popup).Concat(hostCommands.Values).ToArray(),hostActions=hostCommands.Values.ToArray()};
      string verb=input.ContainsKey("verb")?(string)input["verb"]:null;uint command=0;
      if((string)input["mode"]=="invoke-test"){
        for(int i=0;i<GetMenuItemCount(popup);i++){uint id=GetMenuItemID(popup,i);if(id<1||id>0x6fff)continue;var name=new StringBuilder(512);if(menu.GetCommandString(new UIntPtr(id-1),0,IntPtr.Zero,name,512)==0&&String.Equals(name.ToString(),verb,StringComparison.OrdinalIgnoreCase)){command=id;break;}}
        if(command==0)throw new Exception("메뉴에서 실행할 명령을 찾을 수 없습니다.");
      }
      if(verb==null){
        ShowInTaskbar=false;FormBorderStyle=FormBorderStyle.None;Opacity=0;Width=1;Height=1;StartPosition=FormStartPosition.Manual;
        Left=Convert.ToInt32(input["x"]);Top=Convert.ToInt32(input["y"]);Show();Activate();SetForegroundWindow(Handle);
        System.Windows.Forms.Timer dismiss=null;if((string)input["mode"]=="dismiss-test"){dismiss=new System.Windows.Forms.Timer();dismiss.Interval=500;dismiss.Tick+=delegate{EndMenu();dismiss.Stop();};dismiss.Start();}
        command=TrackPopupMenuEx(popup,0x100|0x2,Left,Top,Handle,IntPtr.Zero);
        if(dismiss!=null)dismiss.Dispose();
        if(command==0)return new {cancelled=true};
        if(hostCommands.ContainsKey(command))return new {action=hostCommands[command],handledByApp=true};
        var buffer=new StringBuilder(256);menu.GetCommandString(new UIntPtr(command-1),0,IntPtr.Zero,buffer,256);verb=buffer.ToString();
        // Shell rename expects IShellView callbacks; QuadFinder supplies its own editor.
        if(new[]{"rename","copy","cut","paste","delete","refresh","newfolder"}.Contains(verb.ToLowerInvariant()))return new {action=verb.ToLowerInvariant(),handledByApp=true};
      }
      if(menu==null)throw new Exception("다른 폴더의 항목은 복사·잘라내기·삭제·경로 복사를 지원합니다. 속성은 같은 폴더의 항목을 선택해 주세요.");
      // Static background verbs have no selected item in IContextMenu. Supply the
      // current folder explicitly for %V/%1 rather than invoking an empty selection.
      if(background&&InvokeBackgroundCommand(verb,paths[0],(string)input["mode"]=="invoke-test"))return new {action=verb,dialogShown=false};
      bool dialogShown=false;System.Windows.Forms.Timer closeDialog=null;
      if((string)input["mode"]=="properties-test"){closeDialog=new System.Windows.Forms.Timer();closeDialog.Interval=500;closeDialog.Tick+=delegate{uint current=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==current&&h!=Handle&&IsWindowVisible(h)){dialogShown=true;PostMessage(h,0x10,IntPtr.Zero,IntPtr.Zero);}return true;},IntPtr.Zero);};closeDialog.Start();}
      IntPtr text=IntPtr.Zero,wide=IntPtr.Zero,directory=IntPtr.Zero,directoryWide=IntPtr.Zero;
      try{
        var info=new InvokeInfo();info.cbSize=Marshal.SizeOf(info);info.fMask=0x4000|0x100; /* UNICODE | NOASYNC */ if((string)input["mode"]=="invoke-test")info.fMask|=0x400;info.hwnd=Handle;info.nShow=1;
        string workingDirectory=background?paths[0]:Path.GetDirectoryName(paths[0])??Path.GetPathRoot(paths[0]);
        info.lpDirectory=directory=Marshal.StringToCoTaskMemAnsi(workingDirectory);info.lpDirectoryW=directoryWide=Marshal.StringToCoTaskMemUni(workingDirectory);
        if(command!=0){info.lpVerb=new IntPtr(command-1);info.lpVerbW=new IntPtr(command-1);}else{info.lpVerb=text=Marshal.StringToCoTaskMemAnsi(verb);info.lpVerbW=wide=Marshal.StringToCoTaskMemUni(verb);}
        Marshal.ThrowExceptionForHR(menu.InvokeCommand(ref info));
        // Keep the STA alive for shell-owned property/open-with dialogs.
        var until=DateTime.UtcNow.AddMilliseconds(600);do{Application.DoEvents();System.Threading.Thread.Sleep(20);}while(DateTime.UtcNow<until);
        while(HasVisibleOwnedWindow()){Application.DoEvents();System.Threading.Thread.Sleep(30);}
        return new {action=verb,dialogShown=dialogShown};
      }finally{if(closeDialog!=null)closeDialog.Dispose();if(text!=IntPtr.Zero)Marshal.FreeCoTaskMem(text);if(wide!=IntPtr.Zero)Marshal.FreeCoTaskMem(wide);if(directory!=IntPtr.Zero)Marshal.FreeCoTaskMem(directory);if(directoryWide!=IntPtr.Zero)Marshal.FreeCoTaskMem(directoryWide);}
    }finally{menu2=null;menu3=null;if(popup!=IntPtr.Zero)DestroyMenu(popup);if(menu!=null){Marshal.ReleaseComObject(menu);menu=null;}if(shell!=null)Marshal.ReleaseComObject(shell);foreach(var pidl in pidls)Marshal.FreeCoTaskMem(pidl);}
  }
  static bool InvokeBackgroundCommand(string verb,string folder,bool testing){
    if(String.IsNullOrEmpty(verb)||verb.IndexOfAny(new[]{'\\','/','\0'})>=0)return false;
    using(var key=Registry.ClassesRoot.OpenSubKey(@"Directory\Background\shell\"+verb)){
      if(key==null||key.GetValue("ExplorerCommandHandler")!=null)return false;
      using(var commandKey=key.OpenSubKey("command")){
        if(commandKey==null||commandKey.GetValue("DelegateExecute")!=null)return false;
        using(var dde=key.OpenSubKey("ddeexec"))if(dde!=null)return false;
        string command=commandKey.GetValue(null,null,RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
        if(String.IsNullOrWhiteSpace(command))return false;
        // Expand registration environment variables before replacing folder tokens,
        // in a single pass so percent signs in user folder names stay literal.
        command=Environment.ExpandEnvironmentVariables(command);
        if(Regex.IsMatch(command,@"%[iI]"))return false;
        string template=command;
        command=Regex.Replace(template,@"%([vVlLwW1]|[2-9*])",match=>{
          if(!"vVlLwW1".Contains(match.Groups[1].Value))return "";
          string value=folder;
          if(match.Index+match.Length<template.Length&&template[match.Index+match.Length]=='"')value=Regex.Replace(value,@"\\+$",end=>end.Value+end.Value);
          return value;
        });
        var startup=new StartupInfo();startup.cb=Marshal.SizeOf(startup);if(testing){startup.dwFlags=1;startup.wShowWindow=0;}
        ProcessInfo process;
        if(!CreateProcess(null,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x10,IntPtr.Zero,folder,ref startup,out process))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        CloseHandle(process.hThread);CloseHandle(process.hProcess);return true;
      }
    }
  }
  void AddHost(IntPtr target,string label,string action,bool enabled=true,bool selected=false){uint id=0x7000u+(uint)hostCommands.Count;hostCommands[id]=action;AppendMenu(target,(enabled?0u:1u)|(selected?8u:0u),new UIntPtr(id),label);}
  void BuildHostMenu(IntPtr target,Dictionary<string,object> input){
    var options=input.ContainsKey("viewOptions")?input["viewOptions"] as Dictionary<string,object>:null;
    Func<string,string,string> setting=(key,fallback)=>options!=null&&options.ContainsKey(key)?Convert.ToString(options[key]):fallback;
    IntPtr views=CreatePopupMenu();var modes=new[]{"extra","tiles","medium","icons","list","details","tile","content"};var names=new[]{"아주 큰 아이콘","큰 아이콘","보통 아이콘","작은 아이콘","목록","자세히","타일","콘텐츠"};
    for(int i=0;i<modes.Length;i++)AddHost(views,names[i],"view:"+modes[i],true,setting("view","details")==modes[i]);AppendMenu(target,0x10,new UIntPtr(unchecked((ulong)views.ToInt64())),"보기(&V)");
    IntPtr sorts=CreatePopupMenu();var fields=new[]{"name","modified","type","size"};var labels=new[]{"이름","수정한 날짜","유형","크기"};for(int i=0;i<fields.Length;i++)AddHost(sorts,labels[i],"sort:"+fields[i],true,setting("sort","name")==fields[i]);AppendMenu(sorts,0x800,UIntPtr.Zero,null);AddHost(sorts,"오름차순","order:asc",true,setting("desc","False")=="False");AddHost(sorts,"내림차순","order:desc",true,setting("desc","False")=="True");AppendMenu(target,0x10,new UIntPtr(unchecked((ulong)sorts.ToInt64())),"정렬 기준(&O)");
    IntPtr groups=CreatePopupMenu();AddHost(groups,"없음","group:none",true,setting("group","none")=="none");AddHost(groups,"유형","group:type",true,setting("group","none")=="type");AddHost(groups,"수정한 날짜","group:modified",true,setting("group","none")=="modified");AddHost(groups,"크기","group:size",true,setting("group","none")=="size");AppendMenu(target,0x10,new UIntPtr(unchecked((ulong)groups.ToInt64())),"분류 방법(&P)");
    AddHost(target,"새로 고침(&E)","refresh");AppendMenu(target,0x800,UIntPtr.Zero,null);AddHost(target,"붙여넣기(&P)","paste",input.ContainsKey("canPaste")&&(bool)input["canPaste"]);AddHost(target,"새 폴더(&N)","newfolder");AppendMenu(target,0x800,UIntPtr.Zero,null);
  }
  bool HasVisibleOwnedWindow(){bool found=false;uint current=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==current&&h!=Handle&&IsWindowVisible(h))found=true;return true;},IntPtr.Zero);return found;}
  static string[] Labels(IntPtr popup){var labels=new List<string>();for(int i=0;i<GetMenuItemCount(popup);i++){var text=new StringBuilder(512);GetMenuString(popup,(uint)i,text,512,0x400);if(text.Length>0)labels.Add(text.ToString());}return labels.ToArray();}
  // Canonical verbs do not depend on UI language or ampersand accelerator markers.
  string[] Verbs(IntPtr popup){var verbs=new List<string>();for(int i=0;i<GetMenuItemCount(popup);i++){uint id=GetMenuItemID(popup,i);if(id<1||id>0x6fff)continue;var text=new StringBuilder(512);if(menu.GetCommandString(new UIntPtr(id-1),0,IntPtr.Zero,text,512)==0&&text.Length>0)verbs.Add(text.ToString().ToLowerInvariant());}return verbs.Distinct().ToArray();}
  protected override void WndProc(ref Message m){
    if(menu!=null&&(m.Msg==0x117||m.Msg==0x2b||m.Msg==0x2c||m.Msg==0x120)){
      IntPtr result;if(menu3!=null&&menu3.HandleMenuMsg2((uint)m.Msg,m.WParam,m.LParam,out result)==0){m.Result=result;return;}
      if(menu2!=null&&menu2.HandleMenuMsg((uint)m.Msg,m.WParam,m.LParam)==0){m.Result=new IntPtr(m.Msg==0x2b||m.Msg==0x2c?1:0);return;}
    }base.WndProc(ref m);
  }
  [StructLayout(LayoutKind.Sequential)]struct InvokeInfo{public int cbSize;public uint fMask;public IntPtr hwnd,lpVerb,lpParameters,lpDirectory;public int nShow;public uint dwHotKey;public IntPtr hIcon,lpTitle,lpVerbW,lpParametersW,lpDirectoryW,lpTitleW;public int x,y;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct StartupInfo{public int cb;public string lpReserved,lpDesktop,lpTitle;public uint dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags;public ushort wShowWindow,cbReserved2;public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;}
  [StructLayout(LayoutKind.Sequential)]struct ProcessInfo{public IntPtr hProcess,hThread;public uint processId,threadId;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref StartupInfo startup,out ProcessInfo process);
  [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
  [ComImport,Guid("000214E4-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IContextMenu{
    [PreserveSig]int QueryContextMenu(IntPtr menu,uint index,uint first,uint last,uint flags);
    [PreserveSig]int InvokeCommand(ref InvokeInfo info);
    [PreserveSig]int GetCommandString(UIntPtr command,uint flags,IntPtr reserved,[MarshalAs(UnmanagedType.LPStr)]StringBuilder value,uint max);
  }
  [ComImport,Guid("000214F4-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IContextMenu2{
    [PreserveSig]int QueryContextMenu(IntPtr m,uint i,uint f,uint l,uint flags);[PreserveSig]int InvokeCommand(ref InvokeInfo info);[PreserveSig]int GetCommandString(UIntPtr id,uint flags,IntPtr reserved,IntPtr value,uint max);[PreserveSig]int HandleMenuMsg(uint msg,IntPtr w,IntPtr l);
  }
  [ComImport,Guid("BCFCE0A0-EC17-11D0-8D10-00A0C90F2719"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IContextMenu3{
    [PreserveSig]int QueryContextMenu(IntPtr m,uint i,uint f,uint l,uint flags);[PreserveSig]int InvokeCommand(ref InvokeInfo info);[PreserveSig]int GetCommandString(UIntPtr id,uint flags,IntPtr reserved,IntPtr value,uint max);[PreserveSig]int HandleMenuMsg(uint msg,IntPtr w,IntPtr l);[PreserveSig]int HandleMenuMsg2(uint msg,IntPtr w,IntPtr l,out IntPtr result);
  }
  [ComImport,Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IShellItemArray{void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out object obj);}
  [ComImport,Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IShellItem{void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out object obj);}
  [ComImport,Guid("000214E6-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IShellFolder{
    void ParseDisplayName(IntPtr h,IntPtr b,IntPtr n,IntPtr e,IntPtr p,IntPtr a);void EnumObjects(IntPtr h,uint f,out IntPtr e);void BindToObject(IntPtr p,IntPtr b,ref Guid i,out IntPtr o);void BindToStorage(IntPtr p,IntPtr b,ref Guid i,out IntPtr o);[PreserveSig]int CompareIDs(IntPtr l,IntPtr a,IntPtr b);void CreateViewObject(IntPtr h,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out object obj);
  }
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SHParseDisplayName(string n,IntPtr b,out IntPtr p,uint a,out uint attrs);
  [DllImport("shell32.dll")]static extern int SHCreateShellItemArrayFromIDLists(uint count,IntPtr[] pidls,out IShellItemArray array);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SHCreateItemFromParsingName(string n,IntPtr b,ref Guid iid,out IShellItem item);
  [DllImport("user32.dll")]static extern bool SetProcessDPIAware();[DllImport("user32.dll")]static extern bool EndMenu();
  [DllImport("user32.dll")]static extern IntPtr CreatePopupMenu();[DllImport("user32.dll")]static extern bool DestroyMenu(IntPtr menu);
  [DllImport("user32.dll")]static extern bool DeleteMenu(IntPtr menu,uint item,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool AppendMenu(IntPtr menu,uint flags,UIntPtr id,string label);
  [DllImport("user32.dll")]static extern uint TrackPopupMenuEx(IntPtr menu,uint flags,int x,int y,IntPtr owner,IntPtr param);
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);[DllImport("user32.dll")]static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll")]static extern uint GetMenuItemID(IntPtr menu,int position);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetMenuString(IntPtr menu,uint item,StringBuilder text,int max,uint flags);
  delegate bool EnumWindow(IntPtr window,IntPtr param);[DllImport("user32.dll")]static extern bool PostMessage(IntPtr window,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")]static extern bool EnumWindows(EnumWindow callback,IntPtr param);[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);[DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
}


