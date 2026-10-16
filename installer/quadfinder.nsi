Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "Sections.nsh"
!include "${CONFIG}"
Name "QuadFinder"
OutFile "${OUTPUT}"
InstallDir "${DEFAULT_DIR}"
InstallDirRegKey HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user
ManifestDPIAware true
SetFont "맑은 고딕" 9
BrandingText "QuadFinder ${VERSION}"
SetCompressor lzma
SetCompressorDictSize 32
SetOverwrite on
VIProductVersion "${NUMERIC_VERSION}"
VIAddVersionKey /LANG=1042 "ProductName" "QuadFinder"
VIAddVersionKey /LANG=1042 "FileDescription" "QuadFinder 설치 마법사"
VIAddVersionKey /LANG=1042 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1042 "LegalCopyright" "QuadFinder contributors"
Icon "${ICON}"
UninstallIcon "${ICON}"
!define MUI_ABORTWARNING
!define MUI_TEXTCOLOR "223044"
!define MUI_BGCOLOR "F4F6F9"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_INSTFILESPAGE_HEADER_TEXT "QuadFinder 설치 중"
!define MUI_INSTFILESPAGE_HEADER_SUBTEXT "필요한 파일을 설치하고 있습니다. 잠시 기다려 주세요."
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "설치를 완료했습니다"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "다음을 눌러 설치 결과를 확인하세요."
Page custom OptionsPage OptionsPageLeave
!insertmacro MUI_PAGE_INSTFILES
Page custom FinishPage FinishPageLeave
UninstPage custom un.DataPage un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
UninstPage custom un.FinishPage
!insertmacro MUI_LANGUAGE "Korean"
Var PurgeData
Var DataCheck
Var OptionsDialog
Var PathInput
Var BrowseButton
Var StartCheck
Var DesktopCheck
Var ShortcutStart
Var ShortcutDesktop
Var RunCheck
Var RunNow

Function EnsureClosed
!ifndef TESTING
  again:
  FindWindow $0 "" "QuadFinder"
  StrCmp $0 0 done
  IfSilent cancel
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "QuadFinder에서 진행 중인 파일 작업을 마친 뒤 앱을 완전히 종료해 주세요." /SD IDCANCEL IDRETRY again
  cancel:
  Abort
  done:
!endif
FunctionEnd
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "64비트 Windows에서 설치할 수 있습니다." /SD IDOK
    Abort
  ${EndIf}
  SetShellVarContext current
  StrCpy $ShortcutStart 1
  StrCpy $ShortcutDesktop 0
  StrCpy $RunNow 0
  Call ParseShortcutOptions
  Call EnsureClosed
FunctionEnd

Function ValidateDirectory
  ClearErrors
  StrLen $0 $INSTDIR
  IntCmp $0 4 bad bad check
  check:
  StrCmp $INSTDIR $WINDIR bad
  StrCmp $INSTDIR $SYSDIR bad
  StrCmp $INSTDIR $PROFILE bad
  StrCmp $INSTDIR $DOCUMENTS bad
  StrCmp $INSTDIR $DESKTOP bad
  StrCmp $INSTDIR $APPDATA bad
  StrCmp $INSTDIR $LOCALAPPDATA bad
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i.r0'
  IntCmp $0 -1 good
  IntOp $0 $0 & 0x400
  IntCmp $0 0 +2
  Goto bad
  IfFileExists "$INSTDIR\quadfinder-install.json" good
  IfFileExists "$INSTDIR\quadfinder-preview.json" good
  FindFirst $0 $1 "$INSTDIR\*"
  loop:
  StrCmp $1 "" empty
  StrCmp $1 "." next
  StrCmp $1 ".." next
  FindClose $0
  Goto bad
  next:
  FindNext $0 $1
  IfErrors empty
  Goto loop
  empty:
  FindClose $0
  good:
  ClearErrors
  Return
  bad:
  SetErrors
FunctionEnd
Function .onVerifyInstDir
  Call ValidateDirectory
  IfErrors 0 +2
  Abort
FunctionEnd

Section "프로그램 파일 (필수)" Main
  SectionIn RO
  Call EnsureClosed
  Call ValidateDirectory
  IfErrors 0 +3
  MessageBox MB_OK|MB_ICONSTOP "비어 있는 전용 폴더 또는 기존 QuadFinder 설치 폴더를 선택해 주세요." /SD IDOK
  Abort
  !insertmacro InstallFiles
  Delete "$INSTDIR\quadfinder-preview.json"
  FileOpen $0 "$INSTDIR\quadfinder-install.json" w
  FileWrite $0 '{"app":"QuadFinder","installer":"nsis","version":"${VERSION}"}'
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REG_KEY}" "DisplayName" "QuadFinder"
  WriteRegStr HKCU "${REG_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REG_KEY}" "Publisher" "QuadFinder contributors"
  WriteRegStr HKCU "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_KEY}" "DisplayIcon" "$INSTDIR\QuadFinder.exe"
  WriteRegStr HKCU "${REG_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${REG_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_KEY}" "NoRepair" 1
SectionEnd
Section "시작 메뉴 바로가기" StartMenu
  CreateDirectory "${MENU_DIR}"
  CreateShortCut "${MENU_DIR}\QuadFinder.lnk" "$INSTDIR\QuadFinder.exe"
  CreateShortCut "${MENU_DIR}\QuadFinder 제거.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd
Section /o "바탕 화면 바로가기" Desktop
  CreateShortCut "${DESKTOP_LINK}" "$INSTDIR\QuadFinder.exe"
SectionEnd
Function ParseShortcutOptions
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/NOSTARTMENU" $1
  ${IfNot} ${Errors}
    StrCpy $ShortcutStart 0
    !insertmacro UnselectSection ${StartMenu}
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/DESKTOP" $1
  ${IfNot} ${Errors}
    StrCpy $ShortcutDesktop 1
    !insertmacro SelectSection ${Desktop}
  ${EndIf}
FunctionEnd
Function OptionsPage
  !insertmacro MUI_HEADER_TEXT "QuadFinder 설치" "설치 위치와 바로가기를 선택하세요."
  nsDialogs::Create 1018
  Pop $OptionsDialog
  SetCtlColors $OptionsDialog 223044 F4F6F9
  ${NSD_CreateLabel} 0 0 100% 22u "빠른 파일 검색과 다중 패널 탐색을 위한 파일 관리자입니다."
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  ${NSD_CreateLabel} 0 26u 100% 12u "설치 위치"
  Pop $0
  SetCtlColors $0 223044 F4F6F9
  ${NSD_CreateDirRequest} 0 42u 238u 14u "$INSTDIR"
  Pop $PathInput
  ${NSD_CreateBrowseButton} 244u 41u 56u 16u "찾아보기…"
  Pop $BrowseButton
  ${NSD_OnClick} $BrowseButton ChooseDirectory
  ${NSD_CreateLabel} 0 66u 100% 12u "바로가기"
  Pop $0
  SetCtlColors $0 223044 F4F6F9
  ${NSD_CreateCheckbox} 0 82u 100% 12u "시작 메뉴에 추가"
  Pop $StartCheck
  SetCtlColors $StartCheck 223044 F4F6F9
  ${NSD_SetState} $StartCheck $ShortcutStart
  ${NSD_CreateCheckbox} 0 100u 100% 12u "바탕 화면에 바로가기 만들기"
  Pop $DesktopCheck
  SetCtlColors $DesktopCheck 223044 F4F6F9
  ${NSD_SetState} $DesktopCheck $ShortcutDesktop
  ${NSD_CreateLabel} 0 118u 100% 14u "현재 사용자 전용 설치 · 업데이트는 GitHub에서 다운로드"
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  GetDlgItem $0 $HWNDPARENT 1
  ${NSD_SetText} $0 "설치"
  nsDialogs::Show
FunctionEnd
Function ChooseDirectory
  Pop $0
  ${NSD_GetText} $PathInput $INSTDIR
  nsDialogs::SelectFolderDialog "QuadFinder를 설치할 폴더를 선택하세요" "$INSTDIR"
  Pop $0
  StrCmp $0 error done
  ${NSD_SetText} $PathInput $0
  done:
FunctionEnd
Function OptionsPageLeave
  ${NSD_GetText} $PathInput $INSTDIR
  Call ValidateDirectory
  IfErrors 0 valid
  MessageBox MB_OK|MB_ICONEXCLAMATION "비어 있는 전용 폴더 또는 기존 QuadFinder 폴더를 선택하세요."
  Abort
  valid:
  ${NSD_GetState} $StartCheck $ShortcutStart
  ${NSD_GetState} $DesktopCheck $ShortcutDesktop
  ${If} $ShortcutStart == 1
    !insertmacro SelectSection ${StartMenu}
  ${Else}
    !insertmacro UnselectSection ${StartMenu}
  ${EndIf}
  ${If} $ShortcutDesktop == 1
    !insertmacro SelectSection ${Desktop}
  ${Else}
    !insertmacro UnselectSection ${Desktop}
  ${EndIf}
FunctionEnd
Function FinishPage
  !insertmacro MUI_HEADER_TEXT "설치가 완료되었습니다" "QuadFinder를 사용할 준비가 되었습니다."
  nsDialogs::Create 1018
  Pop $OptionsDialog
  SetCtlColors $OptionsDialog 223044 F4F6F9
  ${NSD_CreateLabel} 0 5u 100% 20u "QuadFinder ${VERSION}"
  Pop $0
  SetCtlColors $0 223044 F4F6F9
  ${NSD_CreateLabel} 0 33u 100% 12u "설치된 위치"
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  ${NSD_CreateText} 0 50u 100% 14u "$INSTDIR"
  Pop $0
  SendMessage $0 ${EM_SETREADONLY} 1 0
  ${NSD_CreateCheckbox} 0 82u 100% 14u "닫은 뒤 QuadFinder 실행"
  Pop $RunCheck
  SetCtlColors $RunCheck 223044 F4F6F9
  ${NSD_SetState} $RunCheck 0
  ${NSD_CreateLabel} 0 110u 100% 20u "설정은 보존됩니다. 앱 제거는 Windows의 설치된 앱에서 할 수 있습니다."
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  GetDlgItem $0 $HWNDPARENT 1
  ${NSD_SetText} $0 "닫기"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd
Function FinishPageLeave
  ${NSD_GetState} $RunCheck $RunNow
  ${If} $RunNow == 1
    Exec '"$INSTDIR\QuadFinder.exe"'
  ${EndIf}
FunctionEnd

Function un.onInit
  SetShellVarContext current
  StrCpy $PurgeData 0
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/PURGEDATA" $1
  IfErrors +2
  StrCpy $PurgeData 1
!ifndef TESTING
  FindWindow $0 "" "QuadFinder"
  StrCmp $0 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "파일 작업을 마치고 QuadFinder를 완전히 종료한 뒤 다시 제거해 주세요." /SD IDOK
  Abort
!endif
FunctionEnd
Function un.DataPage
  !insertmacro MUI_HEADER_TEXT "QuadFinder 제거" "프로그램과 바로가기를 제거합니다."
  nsDialogs::Create 1018
  Pop $OptionsDialog
  SetCtlColors $OptionsDialog 223044 F4F6F9
  ${NSD_CreateLabel} 0 0 100% 42u "프로그램 파일과 바로가기를 제거하며 설정은 기본 보존합니다. 설정은 다른 QuadFinder 설치본과 공유될 수 있습니다. 문서·사진·즐겨찾기의 실제 폴더는 삭제하지 않습니다."
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  ${NSD_CreateCheckbox} 0 66u 100% 20u "설정·즐겨찾기·검색 인덱스도 삭제"
  Pop $DataCheck
  SetCtlColors $DataCheck 223044 F4F6F9
  ${NSD_SetState} $DataCheck $PurgeData
  ${NSD_CreateLabel} 0 98u 100% 30u "선택하지 않으면 설정·즐겨찾기·검색 인덱스를 그대로 보존합니다."
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  GetDlgItem $0 $HWNDPARENT 1
  ${NSD_SetText} $0 "제거"
  nsDialogs::Show
FunctionEnd
Function un.DataPageLeave
  ${NSD_GetState} $DataCheck $PurgeData
FunctionEnd
Function un.CheckDir
  Exch $0
  Push $1
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntCmp $1 -1 done
  IntOp $1 $1 & 0x400
  IntCmp $1 0 done
  MessageBox MB_OK|MB_ICONSTOP "설치 폴더에 연결 경로가 있습니다. 원래 폴더를 복원한 뒤 제거해 주세요." /SD IDOK
  Abort
  done:
  Pop $1
  Pop $0
FunctionEnd
Section "Uninstall"
  Push "$INSTDIR"
  Call un.CheckDir
  !insertmacro UninstallFiles
  Delete "$INSTDIR\quadfinder-preview.json"
  Delete "$INSTDIR\quadfinder-install.json"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "${MENU_DIR}\QuadFinder.lnk"
  Delete "${MENU_DIR}\QuadFinder 제거.lnk"
  RMDir "${MENU_DIR}"
  Delete "${DESKTOP_LINK}"
  DeleteRegKey HKCU "${REG_KEY}"
  StrCmp $PurgeData 1 0 done
  Push "${DATA_DIR}"
  Call un.CheckDir
  !insertmacro DeleteSettings
  RMDir "${DATA_DIR}"
  done:
SectionEnd

Function un.FinishPage
  !insertmacro MUI_HEADER_TEXT "제거가 완료되었습니다" "QuadFinder 프로그램과 바로가기를 제거했습니다."
  nsDialogs::Create 1018
  Pop $OptionsDialog
  SetCtlColors $OptionsDialog 223044 F4F6F9
  ${If} $PurgeData == 1
    ${NSD_CreateLabel} 0 10u 100% 35u "선택한 앱 설정과 검색 인덱스를 함께 제거했습니다. 문서와 개인 파일은 유지됩니다."
  ${Else}
    ${NSD_CreateLabel} 0 10u 100% 35u "앱 설정과 즐겨찾기를 보존했습니다. 다시 설치하면 계속 사용할 수 있습니다."
  ${EndIf}
  Pop $0
  SetCtlColors $0 5C6D82 F4F6F9
  GetDlgItem $0 $HWNDPARENT 1
  ${NSD_SetText} $0 "닫기"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd
