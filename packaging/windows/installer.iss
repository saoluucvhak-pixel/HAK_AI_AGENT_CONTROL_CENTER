; Inno Setup script. Per-user install (no administrator rights). Unsigned unless a code-signing step is added to CI.
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyNumericVersion
  #define MyNumericVersion "0.0.0.0"
#endif
#ifndef StageDir
  #define StageDir "..\..\dist\stage"
#endif
#ifndef OutDir
  #define OutDir "..\..\dist"
#endif
[Setup]
AppId={{6E0C4A52-7B1D-4C0E-9C57-7A1E2B7F4D10}
AppName=HAK AI Agent Control Center
AppVersion={#MyAppVersion}
AppPublisher=HAK
VersionInfoVersion={#MyNumericVersion}
DefaultDirName={localappdata}\Programs\HAK AI Agent Control Center
DefaultGroupName=HAK AI Agent Control Center
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir={#OutDir}
OutputBaseFilename=HAK_AI_AGENT_SETUP_{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayName=HAK AI Agent Control Center
SetupLogging=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "Tạo shortcut trên Desktop"; GroupDescription: "Shortcut:"
[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
[Icons]
Name: "{autodesktop}\HAK AI Agent Control Center"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\HAK_AI_AGENT.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autoprograms}\HAK AI Agent Control Center\HAK AI Agent Control Center"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\HAK_AI_AGENT.vbs"""; WorkingDir: "{app}"
Name: "{autoprograms}\HAK AI Agent Control Center\Dừng HAK"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\HAK_STOP.vbs"""; WorkingDir: "{app}"
Name: "{autoprograms}\HAK AI Agent Control Center\Gỡ cài đặt"; Filename: "{uninstallexe}"
[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\HAK_AI_AGENT.vbs"""; WorkingDir: "{app}"; Description: "Mở HAK AI Agent Control Center"; Flags: postinstall nowait skipifsilent
[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: "scripts\stop.mjs"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "StopHak"
[Code]
function StopRunningHak(): Boolean;
var rc: Integer; node: String;
begin
  Result := True;
  node := ExpandConstant('{app}\runtime\node.exe');
  if FileExists(node) then
    Exec(node, 'scripts\stop.mjs', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, rc);
  Sleep(1500);
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningHak();
  Result := '';
end;
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var dataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    dataDir := ExpandConstant('{localappdata}\HAK\AI_AGENT_CONTROL_CENTER');
    { User data is kept unless the user explicitly agrees (interactive) or passes /PURGEDATA (silent). }
    if DirExists(dataDir) then
      if ExpandConstant('{param:PURGEDATA|0}') = '1' then
        DelTree(dataDir, True, True, True)
      else if not UninstallSilent then
        if MsgBox('Xóa luôn dữ liệu người dùng (cấu hình, kết quả, nhật ký) tại ' + dataDir + '?' + #13#10 + 'Chọn Không để giữ lại dữ liệu.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
          DelTree(dataDir, True, True, True);
  end;
end;
