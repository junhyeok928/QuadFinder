using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
class SetupWindow {
 Window window; TextBox installPath; CheckBox startCheck,desktopCheck,runCheck; Button primary,cancel,close,browse; TextBlock error;
 bool busy,finished,welcome=true; string target; readonly string[] args; readonly Stopwatch clock=Stopwatch.StartNew();
 T Get<T>(string name) where T:class{return window.FindName(name) as T;}
 void Text(string name,string value){Get<TextBlock>(name).Text=value;}
 void Stage(string name){foreach(string page in new[]{"WelcomePage","OptionsPage","ProgressPage","FinishPage"})Get<StackPanel>(page).Visibility=page==name?Visibility.Visible:Visibility.Collapsed;if(name=="WelcomePage"){welcome=true;primary.Content="다음";cancel.Content="취소";}else if(name=="OptionsPage"){welcome=false;primary.Content="설치";cancel.Content="이전";}}
 [STAThread] static int Main(string[] args){try{return new SetupWindow(args).Run();}catch(Exception e){MessageBox.Show(e.Message,"QuadFinder 설치",MessageBoxButton.OK,MessageBoxImage.Error);return 1;}}
 SetupWindow(string[] input){args=input;}
 int Run(){
  if(Array.Exists(args,value=>String.Equals(value,"/S",StringComparison.OrdinalIgnoreCase)))return SilentInstall();
  using(Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("QuadFinder.SetupView"))window=(Window)XamlReader.Load(stream);
  installPath=Get<TextBox>("InstallPath");startCheck=Get<CheckBox>("StartMenuCheck");desktopCheck=Get<CheckBox>("DesktopCheck");runCheck=Get<CheckBox>("RunCheck");primary=Get<Button>("PrimaryButton");cancel=Get<Button>("CancelButton");close=Get<Button>("CloseButton");browse=Get<Button>("BrowseButton");error=Get<TextBlock>("ErrorText");
  using(Stream icon=Assembly.GetExecutingAssembly().GetManifestResourceStream("QuadFinder.SetupIcon")){var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.StreamSource=icon;image.EndInit();Get<Image>("AppIcon").Source=image;window.Icon=image;}
  target=SetupConfig.DefaultDirectory;
  if(!SetupConfig.Testing){using(RegistryKey key=Registry.CurrentUser.OpenSubKey(SetupConfig.RegistryKey)){string existing=key==null?null:key.GetValue("InstallLocation") as string;if(!String.IsNullOrEmpty(existing))target=existing;}}
  installPath.Text=target;Text("VersionText","v"+SetupConfig.Version+"");
  Get<Grid>("TitleBar").MouseLeftButtonDown+=(s,e)=>{if(e.ChangedButton==MouseButton.Left)window.DragMove();};
  browse.Click+=(s,e)=>{using(var chooser=new System.Windows.Forms.FolderBrowserDialog()){chooser.Description="QuadFinder 설치 위치";chooser.SelectedPath=installPath.Text;if(chooser.ShowDialog()==System.Windows.Forms.DialogResult.OK)installPath.Text=chooser.SelectedPath;}};
  close.Click+=(s,e)=>window.Close();cancel.Click+=(s,e)=>{if(!busy&&!finished&&!welcome)Stage("WelcomePage");else window.Close();};window.Closing+=(s,e)=>{if(busy){e.Cancel=true;Text("ProgressDetail","설치가 진행 중입니다. 완료되면 닫을 수 있습니다.");}};
  primary.Click+=async(s,e)=>{if(welcome){Stage("OptionsPage");installPath.Focus();return;}if(finished){if(runCheck.IsChecked==true)try{Process.Start(new ProcessStartInfo(Path.Combine(target,"QuadFinder.exe")){UseShellExecute=true});}catch(Exception launch){error.Text=launch.Message;return;}window.Close();return;}await Install();};
  window.PreviewKeyDown+=(s,e)=>{if(e.Key==Key.Escape&&!busy)window.Close();};
#if TESTING
  window.ShowInTaskbar=false;window.ShowActivated=false;window.WindowStartupLocation=WindowStartupLocation.Manual;window.Left=-10000;window.Top=0;
#endif
  window.ContentRendered+=(s,e)=>{
#if TESTING
   string folder=Arg("--ui-test=");if(folder!=null){Directory.CreateDirectory(folder);File.WriteAllText(Path.Combine(folder,"ready-ms.txt"),clock.ElapsedMilliseconds.ToString());var timer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(120)};timer.Tick+=async(a,b)=>{timer.Stop();if(!Get<StackPanel>("WelcomePage").IsVisible)throw new Exception("Welcome page missing");Capture(Path.Combine(folder,"setup-welcome.png"));primary.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));if(!Get<StackPanel>("OptionsPage").IsVisible)throw new Exception("Options navigation failed");string retainedPath=installPath.Text;installPath.Text=retainedPath+" retained";startCheck.IsChecked=false;desktopCheck.IsChecked=true;cancel.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));primary.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));if(installPath.Text!=retainedPath+" retained"||startCheck.IsChecked!=false||desktopCheck.IsChecked!=true)throw new Exception("Back navigation discarded options");installPath.Text=retainedPath;startCheck.IsChecked=true;desktopCheck.IsChecked=false;Capture(Path.Combine(folder,"setup-options.png"));if(startCheck.IsChecked!=true||desktopCheck.IsChecked!=false||runCheck.IsChecked!=false)throw new Exception("Unexpected shortcut or run defaults");string originalPath=installPath.Text;installPath.Text=Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);await Install();if(finished||String.IsNullOrEmpty(error.Text))throw new Exception("Protected folder validation failed");installPath.Text=originalPath;if(Arg("--desktop-only")!=null){startCheck.IsChecked=false;desktopCheck.IsChecked=true;}await Install();Capture(Path.Combine(folder,finished?"setup-finish.png":"setup-error.png"));File.WriteAllText(Path.Combine(folder,"result.txt"),finished?"ok":error.Text);window.Close();};timer.Start();}
#endif
  };
  var app=new Application();app.Run(window);return finished||!busy?0:1;
 }
 string Arg(string prefix){foreach(string value in args)if(value.StartsWith(prefix,StringComparison.Ordinal))return value.Substring(prefix.Length);return null;}
 async Task Install(){
  error.Text="";string directory;
  try{directory=Validate(installPath.Text);if(!SetupConfig.Testing&&Process.GetProcessesByName("QuadFinder").Length>0)throw new Exception("QuadFinder를 완전히 종료한 뒤 다시 설치해 주세요.");}
  catch(Exception validation){error.Text=validation.Message;return;}
  target=directory;bool start=startCheck.IsChecked==true,desktop=desktopCheck.IsChecked==true;busy=true;primary.IsEnabled=false;cancel.IsEnabled=false;close.IsEnabled=false;Stage("ProgressPage");
#if TESTING
  string preview=Arg("--ui-test=");if(preview!=null)Capture(Path.Combine(preview,"setup-progress.png"));
#endif
  string temporary=Path.Combine(Path.GetTempPath(),"QuadFinder-Setup-"+Guid.NewGuid().ToString("N"));
  try{
   await Task.Run(()=>{
    string engine=PrepareEngine(temporary,percent=>window.Dispatcher.Invoke(new Action(()=>{Get<ProgressBar>("InstallProgress").Value=percent;})));
    window.Dispatcher.Invoke(new Action(()=>{Text("ProgressTitle","QuadFinder를 설치하고 있습니다");Text("ProgressText","프로그램 파일과 바로가기를 설치하는 중입니다.");Text("ProgressDetail",target);Get<ProgressBar>("InstallProgress").IsIndeterminate=true;}));
    string command="/S "+(start?"":"/NOSTARTMENU ")+(desktop?"/DESKTOP ":"")+"/D="+target;
    using(var process=Process.Start(new ProcessStartInfo(engine,command){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden})){process.WaitForExit();if(process.ExitCode!=0)throw new Exception("설치를 완료하지 못했습니다. 설치 위치와 사용 중인 파일을 확인해 주세요.");}
    if(!File.Exists(Path.Combine(target,"QuadFinder.exe"))||!File.Exists(Path.Combine(target,"Uninstall.exe")))throw new Exception("설치 파일을 확인하지 못했습니다. 다시 시도해 주세요.");
   });
   finished=true;Stage("FinishPage");Text("InstalledPath",target);primary.Content="닫기";cancel.Visibility=Visibility.Collapsed;
  }catch(Exception failure){Stage("OptionsPage");error.Text=failure.Message;Get<ProgressBar>("InstallProgress").IsIndeterminate=false;}
  finally{busy=false;primary.IsEnabled=true;cancel.IsEnabled=true;close.IsEnabled=true;try{if(Directory.Exists(temporary))Directory.Delete(temporary,true);}catch{}}
 }
 string PrepareEngine(string directory,Action<double> progress){
  Directory.CreateDirectory(directory);string engine=Path.Combine(directory,"SetupEngine.exe");
  using(Stream payload=Assembly.GetExecutingAssembly().GetManifestResourceStream("QuadFinder.SetupPayload"))using(var output=new FileStream(engine,FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] buffer=new byte[1024*1024];int read;long copied=0;while((read=payload.Read(buffer,0,buffer.Length))>0){output.Write(buffer,0,read);copied+=read;if(progress!=null)progress((double)copied/payload.Length*100);}}
  using(var sha=SHA256.Create())using(var file=File.OpenRead(engine)){string hash=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();if(hash!=SetupConfig.PayloadHash)throw new Exception("설치 파일 검증에 실패했습니다. 파일을 다시 받아 주세요.");}return engine;
 }
 int SilentInstall(){
  string temporary=Path.Combine(Path.GetTempPath(),"QuadFinder-Setup-"+Guid.NewGuid().ToString("N"));
  try{
   string destination=SetupConfig.DefaultDirectory;for(int i=0;i<args.Length;i++)if(args[i].StartsWith("/D=",StringComparison.OrdinalIgnoreCase)){destination=String.Join(" ",args,i,args.Length-i).Substring(3);break;}
   destination=Validate(destination);string engine=PrepareEngine(temporary,null);string command="/S "+(Array.Exists(args,a=>String.Equals(a,"/NOSTARTMENU",StringComparison.OrdinalIgnoreCase))?"/NOSTARTMENU ":"")+(Array.Exists(args,a=>String.Equals(a,"/DESKTOP",StringComparison.OrdinalIgnoreCase))?"/DESKTOP ":"")+"/D="+destination;
   using(var process=Process.Start(new ProcessStartInfo(engine,command){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden})){process.WaitForExit();return process.ExitCode;}
  }catch{return 1;}finally{try{if(Directory.Exists(temporary))Directory.Delete(temporary,true);}catch{}}
 }
 string Validate(string value){
  if(String.IsNullOrWhiteSpace(value)||value.IndexOfAny(new[]{'"','\r','\n'})>=0)throw new Exception("올바른 설치 폴더를 입력해 주세요.");string full=Path.GetFullPath(value.Trim());
  if(full.StartsWith(@"\\")||String.Equals(full.TrimEnd('\\'),Path.GetPathRoot(full).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("로컬 드라이브의 전용 폴더를 선택해 주세요.");
  foreach(string forbidden in new[]{Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.System),Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)})if(String.Equals(full.TrimEnd('\\'),forbidden.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("전용 하위 폴더를 선택해 주세요.");
  for(string current=full;!String.IsNullOrEmpty(current);current=Path.GetDirectoryName(current)){if(Directory.Exists(current)&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new Exception("연결·정션을 통하지 않는 설치 위치를 선택해 주세요.");}
  if(Directory.Exists(full)&&Directory.GetFileSystemEntries(full).Length>0&&!File.Exists(Path.Combine(full,"quadfinder-install.json"))&&!File.Exists(Path.Combine(full,"quadfinder-preview.json")))throw new Exception("비어 있는 폴더 또는 기존 QuadFinder 설치 폴더를 선택해 주세요.");return full;
 }
#if TESTING
 void Capture(string filename){window.UpdateLayout();var image=new RenderTargetBitmap((int)window.ActualWidth,(int)window.ActualHeight,96,96,PixelFormats.Pbgra32);image.Render(window);var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(image));using(var output=File.Create(filename))png.Save(output);}
#endif
}
