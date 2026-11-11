[Setup]
AppId={{C4ED2973-CE64-4A97-AF1C-5233E2E2AC21}
AppName=Elegant Solution Tracking Agent
AppVersion=0.5.0
DefaultDirName={autopf}\ElegantSolution\Agent
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputDir=release
OutputBaseFilename=ElegantAgentSetup_0.5.0_x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
Uninstallable=no

[Files]
Source: "release\dist\ElegantAgentService.exe"; DestDir: "{tmp}\dist"; Flags: deleteafterinstall
Source: "release\dist\ElegantAgentUI.exe"; DestDir: "{tmp}\dist"; Flags: deleteafterinstall
Source: "release\setup.bat"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "release\uninstall.bat"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "release\restart.bat"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "release\stop_agent.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "release\remove_hosts.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "release\deployment.json"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    ResultCode := -1;
    if not Exec(ExpandConstant('{cmd}'), '/C "' + ExpandConstant('{tmp}\setup.bat') + '"',
      ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or
      (ResultCode <> 0) then
      RaiseException('Agent service installation failed. Check the installer log.');
  end;
end;
