param([Parameter(Mandatory=$true)][string]$Before,[Parameter(Mandatory=$true)][string]$After,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public class SetupStartupProbe{
 public delegate bool Callback(IntPtr h,IntPtr data);
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int L,T,R,B;}
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 public static bool Ready(uint pid){bool found=false;EnumWindows(delegate(IntPtr h,IntPtr d){uint p;GetWindowThreadProcessId(h,out p);if(p!=pid)return true;Rect r;GetWindowRect(h,out r);var text=new StringBuilder(256);GetWindowText(h,text,256);if(r.R-r.L>400&&r.B-r.T>300&&text.ToString().Contains("QuadFinder")){found=true;return false;}return true;},IntPtr.Zero);return found;}
}
'@
$measurements=@()
foreach($entry in @(@{Name='before';Path=$Before},@{Name='after';Path=$After})){
 $clock=[Diagnostics.Stopwatch]::StartNew();$process=Start-Process -FilePath $entry.Path -PassThru -WindowStyle Hidden
 try{
  $ready=$false
  while($clock.ElapsedMilliseconds -lt 60000){$process.Refresh();if($process.HasExited){break};if([SetupStartupProbe]::Ready($process.Id)){$ready=$true;break};Start-Sleep -Milliseconds 25}
  $measurements+=@{name=$entry.Name;windowReady=$ready;milliseconds=$clock.ElapsedMilliseconds;bytes=(Get-Item -LiteralPath $entry.Path).Length}
 }finally{if(-not $process.HasExited){Stop-Process -Id $process.Id -Force}}
}
$measurements | ConvertTo-Json | Set-Content -LiteralPath $Report -Encoding UTF8
$measurements | ConvertTo-Json
