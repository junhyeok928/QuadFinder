Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "${CONFIG}"
Name "QuadFinder 미리보기"
OutFile "${OUTPUT}"
InstallDir "${DEFAULT_DIR}"
InstallDirRegKey HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user
ManifestDPIAware true
SetFont "맑은 고딕" 9
BrandingText "QuadFinder · 출시 전 미리보기"
SetCompressor /SOLID lzma
SetCompressorDictSize 32
SetOverwrite on
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1042 "ProductName" "QuadFinder 미리보기"
VIAddVersionKey /LANG=1042 "FileDescription" "QuadFinder 설치 마법사 (출시 전 검토용)"
VIAddVersionKey /LANG=1042 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1042 "LegalCopyright" "QuadFinder contributors"
Icon "${ICON}"
UninstallIcon "${ICON}"
!define MUI_ABORTWARNING
!define MUI_TEXTCOLOR "222222"
!define MUI_BGCOLOR "FFFFFF"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${WIZARD_BITMAP}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${WIZARD_BITMAP}"
!define MUI_WELCOMEPAGE_TITLE "QuadFinder 설치 마법사"
!define MUI_WELCOMEPAGE_TEXT "빠른 파일 검색과 다중 패널 탐색을 위한 QuadFinder를 설치합니다.$\r$\n$\r$\n버전 ${VERSION} · 출시 전 미리보기$\r$\n$\r$\n설치 위치와 바로가기를 선택할 수 있습니다. 문서와 개인 파일은 변경하지 않습니다.$\r$\n$\r$\n이 빌드는 자동 업데이트를 확인하지 않습니다."
!define MUI_FINISHPAGE_RUN "$INSTDIR\QuadFinder.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_FINISHPAGE_RUN_TEXT "QuadFinder 실행"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!define MUI_DIRECTORYPAGE_TEXT_TOP "설치할 폴더를 선택하세요. 비어 있는 전용 폴더 또는 기존 QuadFinder 미리보기 폴더를 사용할 수 있습니다."
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPage un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "Korean"
Var PurgeData
Var DataCheck

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
  MessageBox MB_OK|MB_ICONSTOP "비어 있는 전용 폴더 또는 기존 미리보기 설치 폴더를 선택해 주세요." /SD IDOK
  Abort
  !insertmacro InstallFiles
  FileOpen $0 "$INSTDIR\quadfinder-preview.json" w
  FileWrite $0 '{"app":"QuadFinder","preview":true,"version":"${VERSION}"}'
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REG_KEY}" "DisplayName" "QuadFinder 미리보기"
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
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
!insertmacro MUI_DESCRIPTION_TEXT ${Main} "파일 검색, 다중 패널 탐색과 제거 프로그램을 설치합니다."
!insertmacro MUI_DESCRIPTION_TEXT ${StartMenu} "현재 사용자 시작 메뉴에 실행 및 제거 바로가기를 만듭니다."
!insertmacro MUI_DESCRIPTION_TEXT ${Desktop} "현재 사용자 바탕 화면에 실행 바로가기를 만듭니다."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

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
  !insertmacro MUI_HEADER_TEXT "사용자 데이터" "제거할 데이터를 선택하세요."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 42u "프로그램 파일과 바로가기를 제거하며 설정은 기본 보존합니다. 설정은 다른 QuadFinder 설치본과 공유될 수 있습니다. 문서·사진·즐겨찾기의 실제 폴더는 삭제하지 않습니다."
  Pop $0
  ${NSD_CreateCheckbox} 0 48u 100% 20u "설정·즐겨찾기·검색 인덱스도 삭제"
  Pop $DataCheck
  ${NSD_SetState} $DataCheck $PurgeData
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
