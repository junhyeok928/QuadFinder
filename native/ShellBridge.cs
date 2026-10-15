using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Runs shell extensions out of Electron's process. All input is JSON over stdin.
class ShellBridge : Form {
  static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=16000000};
  IContextMenu menu; IContextMenu2 menu2; IContextMenu3 menu3;
  [STAThread] static int Main(){
    SetProcessDPIAware();Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
    try{var input=json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());object result;
      string mode=(string)input["mode"];
      if(mode=="attributes")result=Paths(input).Select(p=>{try{var a=File.GetAttributes(p);return new {path=p,hidden=(a&FileAttributes.Hidden)!=0,system=(a&FileAttributes.System)!=0,readOnly=(a&FileAttributes.ReadOnly)!=0};}catch{return new {path=p,hidden=false,system=false,readOnly=false};}}).ToArray();
      else if(mode=="clipboard-write") {var data=new DataObject();var paths=new StringCollection();paths.AddRange(Paths(input));data.SetFileDropList(paths);data.SetData("Preferred DropEffect",new MemoryStream(BitConverter.GetBytes((string)input["kind"]=="move"?2:5)));Clipboard.SetDataObject(data,true);result=true;}
      else if(mode=="clipboard-read") {var data=Clipboard.GetDataObject();var files=Clipboard.ContainsFileDropList()?Clipboard.GetFileDropList().Cast<string>().ToArray():new string[0];var effect=data==null?null:data.GetData("Preferred DropEffect") as MemoryStream;result=new {paths=files,kind=effect!=null&&effect.Length>=4&&(BitConverter.ToInt32(effect.ToArray(),0)&2)!=0?"move":"copy"};}
      else using(var form=new ShellBridge()){result=form.Run(input);}
      Console.WriteLine(json.Serialize(new {ok=true,value=result}));return 0;
    }catch(Exception error){Console.WriteLine(json.Serialize(new {ok=false,error=error.Message}));return 1;}
  }
  static string[] Paths(Dictionary<string,object> input){return ((System.Collections.IEnumerable)input["paths"]).Cast<string>().ToArray();}
  object Run(Dictionary<string,object> input){
    var paths=Paths(input);if(paths.Length<1)throw new Exception("파일을 선택하세요.");
    bool background=input.ContainsKey("background")&&(bool)input["background"];
    var pidls=new List<IntPtr>();object shell=null;IntPtr popup=IntPtr.Zero;
    try{
      Guid iid=new Guid("000214E4-0000-0000-C000-000000000046");
      if(background){IShellItem item;Guid itemId=typeof(IShellItem).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(paths[0],IntPtr.Zero,ref itemId,out item));
        try{Guid folderHandler=new Guid("3981E224-F559-11D3-8E3A-00C04F6837D5"),folderId=typeof(IShellFolder).GUID;object obj;item.BindToHandler(IntPtr.Zero,ref folderHandler,ref folderId,out obj);shell=obj;var folder=(IShellFolder)obj;folder.CreateViewObject(Handle,ref iid,out obj);menu=(IContextMenu)obj;}finally{Marshal.ReleaseComObject(item);}
      }else{
        if(paths.Select(p=>Path.GetDirectoryName(p).ToLowerInvariant()).Distinct().Count()>1)throw new Exception("시스템 확장 메뉴는 같은 폴더의 항목을 선택해 사용하세요.");
        foreach(var path in paths){IntPtr pidl;uint attrs;Marshal.ThrowExceptionForHR(SHParseDisplayName(path,IntPtr.Zero,out pidl,0,out attrs));pidls.Add(pidl);}
        IShellItemArray array;Marshal.ThrowExceptionForHR(SHCreateShellItemArrayFromIDLists((uint)pidls.Count,pidls.ToArray(),out array));shell=array;
        Guid handler=new Guid("3981E225-F559-11D3-8E3A-00C04F6837D5");object obj;array.BindToHandler(IntPtr.Zero,ref handler,ref iid,out obj);menu=(IContextMenu)obj;
      }
      menu2=menu as IContextMenu2;menu3=menu as IContextMenu3;
      popup=CreatePopupMenu();Marshal.ThrowExceptionForHR(menu.QueryContextMenu(popup,0,1,0x6fff,0x4|0x10|0x100));
      if((string)input["mode"]=="probe")return new {count=GetMenuItemCount(popup),labels=Labels(popup)};
      string verb=input.ContainsKey("verb")?(string)input["verb"]:null;uint command=0;
      if(verb==null){
        ShowInTaskbar=false;FormBorderStyle=FormBorderStyle.None;Opacity=0;Width=1;Height=1;StartPosition=FormStartPosition.Manual;
        Left=Convert.ToInt32(input["x"]);Top=Convert.ToInt32(input["y"]);Show();Activate();SetForegroundWindow(Handle);
        System.Windows.Forms.Timer dismiss=null;if((string)input["mode"]=="dismiss-test"){dismiss=new System.Windows.Forms.Timer();dismiss.Interval=500;dismiss.Tick+=delegate{EndMenu();dismiss.Stop();};dismiss.Start();}
        command=TrackPopupMenuEx(popup,0x100|0x2,Left,Top,Handle,IntPtr.Zero);
        if(dismiss!=null)dismiss.Dispose();
        if(command==0)return new {cancelled=true};
        var buffer=new StringBuilder(256);menu.GetCommandString(new UIntPtr(command-1),0,IntPtr.Zero,buffer,256);verb=buffer.ToString();
        // Shell rename expects IShellView callbacks; QuadFinder supplies its own editor.
        if(verb=="rename")return new {action="rename"};
      }
      bool dialogShown=false;System.Windows.Forms.Timer closeDialog=null;
      if((string)input["mode"]=="properties-test"){closeDialog=new System.Windows.Forms.Timer();closeDialog.Interval=500;closeDialog.Tick+=delegate{uint current=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==current&&h!=Handle&&IsWindowVisible(h)){dialogShown=true;PostMessage(h,0x10,IntPtr.Zero,IntPtr.Zero);}return true;},IntPtr.Zero);};closeDialog.Start();}
      IntPtr text=IntPtr.Zero,wide=IntPtr.Zero;
      try{
        var info=new InvokeInfo();info.cbSize=Marshal.SizeOf(info);info.fMask=0x4000|0x100; /* UNICODE | NOASYNC */ info.hwnd=Handle;info.nShow=1;
        if(command!=0){info.lpVerb=new IntPtr(command-1);info.lpVerbW=new IntPtr(command-1);}else{info.lpVerb=text=Marshal.StringToCoTaskMemAnsi(verb);info.lpVerbW=wide=Marshal.StringToCoTaskMemUni(verb);}
        Marshal.ThrowExceptionForHR(menu.InvokeCommand(ref info));
        // Keep the STA alive for shell-owned property/open-with dialogs.
        var until=DateTime.UtcNow.AddMilliseconds(600);do{Application.DoEvents();System.Threading.Thread.Sleep(20);}while(DateTime.UtcNow<until);
        while(HasVisibleOwnedWindow()){Application.DoEvents();System.Threading.Thread.Sleep(30);}
        return new {action=verb,dialogShown=dialogShown};
      }finally{if(closeDialog!=null)closeDialog.Dispose();if(text!=IntPtr.Zero)Marshal.FreeCoTaskMem(text);if(wide!=IntPtr.Zero)Marshal.FreeCoTaskMem(wide);}
    }finally{if(popup!=IntPtr.Zero)DestroyMenu(popup);if(menu!=null)Marshal.ReleaseComObject(menu);if(shell!=null)Marshal.ReleaseComObject(shell);foreach(var pidl in pidls)Marshal.FreeCoTaskMem(pidl);}
  }
  bool HasVisibleOwnedWindow(){bool found=false;uint current=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==current&&h!=Handle&&IsWindowVisible(h))found=true;return true;},IntPtr.Zero);return found;}
  static string[] Labels(IntPtr popup){var labels=new List<string>();for(int i=0;i<GetMenuItemCount(popup);i++){var text=new StringBuilder(512);GetMenuString(popup,(uint)i,text,512,0x400);if(text.Length>0)labels.Add(text.ToString());}return labels.ToArray();}
  protected override void WndProc(ref Message m){
    if(menu!=null&&(m.Msg==0x117||m.Msg==0x2b||m.Msg==0x2c||m.Msg==0x120)){
      IntPtr result;if(menu3!=null&&menu3.HandleMenuMsg2((uint)m.Msg,m.WParam,m.LParam,out result)==0){m.Result=result;return;}
      if(menu2!=null&&menu2.HandleMenuMsg((uint)m.Msg,m.WParam,m.LParam)==0){m.Result=new IntPtr(m.Msg==0x2b||m.Msg==0x2c?1:0);return;}
    }base.WndProc(ref m);
  }
  [StructLayout(LayoutKind.Sequential)]struct InvokeInfo{public int cbSize;public uint fMask;public IntPtr hwnd,lpVerb,lpParameters,lpDirectory;public int nShow;public uint dwHotKey;public IntPtr hIcon,lpTitle,lpVerbW,lpParametersW,lpDirectoryW,lpTitleW;public int x,y;}
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
  [DllImport("user32.dll")]static extern uint TrackPopupMenuEx(IntPtr menu,uint flags,int x,int y,IntPtr owner,IntPtr param);
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);[DllImport("user32.dll")]static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetMenuString(IntPtr menu,uint item,StringBuilder text,int max,uint flags);
  delegate bool EnumWindow(IntPtr window,IntPtr param);[DllImport("user32.dll")]static extern bool PostMessage(IntPtr window,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")]static extern bool EnumWindows(EnumWindow callback,IntPtr param);[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);[DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
}


