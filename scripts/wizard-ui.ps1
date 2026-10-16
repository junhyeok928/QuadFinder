param([Parameter(Mandatory=$true)][string]$Setup,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WizardWindow {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h,int id);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint message,IntPtr w,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h,WindowCallback callback,IntPtr p);
 public static IntPtr ChildText(IntPtr parent,string value){IntPtr found=IntPtr.Zero;EnumChildWindows(parent,delegate(IntPtr h,IntPtr p){var text=new System.Text.StringBuilder(512);GetWindowText(h,text,512);if(text.ToString()==value){found=h;return false;}return true;},IntPtr.Zero);return found;}
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint message,IntPtr w,IntPtr l);
 public delegate bool WindowCallback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(WindowCallback callback,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public static IntPtr OwnWindow(uint pid){IntPtr found=IntPtr.Zero;EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid){found=h;return false;}return true;},IntPtr.Zero);return found;}
}
'@
[WizardWindow]::SetProcessDPIAware() | Out-Null
$wizardProcess=Start-Process -FilePath $Setup -PassThru -WindowStyle Hidden
try {
  $wizardHandle=[IntPtr]::Zero
  for($attempt=0;$attempt -lt 100;$attempt++){
    $wizardProcess.Refresh();$wizardHandle=[WizardWindow]::OwnWindow($wizardProcess.Id)
    if($wizardHandle -ne [IntPtr]::Zero){break}
    Start-Sleep -Milliseconds 100
  }
  if($wizardHandle -eq [IntPtr]::Zero){throw 'Owned wizard window not found'}
  [WizardWindow]::ShowWindow($wizardHandle,4) | Out-Null
  New-Item -ItemType Directory -Path $Output -Force | Out-Null
  foreach($wizardPage in @('options','progress','finish')){
    Start-Sleep -Milliseconds 350
    if($wizardPage -eq 'options'){
      $startCheck=[WizardWindow]::ChildText($wizardHandle,'시작 메뉴에 추가')
      $desktopCheck=[WizardWindow]::ChildText($wizardHandle,'바탕 화면에 바로가기 만들기')
      if($startCheck -eq [IntPtr]::Zero -or $desktopCheck -eq [IntPtr]::Zero){throw 'Shortcut controls missing'}
      if([WizardWindow]::SendMessage($startCheck,0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt32() -ne 1){throw 'Start menu default must be selected'}
      if([WizardWindow]::SendMessage($desktopCheck,0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt32() -ne 0){throw 'Desktop default must be off'}
    }
    if($wizardPage -eq 'finish'){
      $runCheck=[WizardWindow]::ChildText($wizardHandle,'닫은 뒤 QuadFinder 실행')
      if($runCheck -eq [IntPtr]::Zero){throw 'Run control missing'}
      if([WizardWindow]::SendMessage($runCheck,0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt32() -ne 0){throw 'Run after install default must be off'}
    }
    $wizardRect=New-Object WizardWindow+Rect
    [WizardWindow]::GetWindowRect($wizardHandle,[ref]$wizardRect) | Out-Null
    $wizardBitmap=New-Object System.Drawing.Bitmap(($wizardRect.Right-$wizardRect.Left),($wizardRect.Bottom-$wizardRect.Top))
    $wizardCanvas=[System.Drawing.Graphics]::FromImage($wizardBitmap)
    $wizardDc=$wizardCanvas.GetHdc()
    try {if(-not [WizardWindow]::PrintWindow($wizardHandle,$wizardDc,2)){throw 'Wizard capture failed'}}finally{$wizardCanvas.ReleaseHdc($wizardDc)}
    $wizardBitmap.Save((Join-Path $Output "wizard-$wizardPage.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $wizardCanvas.Dispose();$wizardBitmap.Dispose()
    if($wizardPage -ne 'finish'){
      $wizardNext=[WizardWindow]::GetDlgItem($wizardHandle,1)
      [WizardWindow]::PostMessage($wizardHandle,0x111,[IntPtr]1,$wizardNext) | Out-Null
    }
  }
} finally {
  if(-not $wizardProcess.HasExited){Stop-Process -Id $wizardProcess.Id -Force}
}
