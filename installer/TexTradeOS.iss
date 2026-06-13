#define MyAppName "TexTradeOS"
#define MyAppVersion GetEnv("TEXTRADEOS_VERSION")
#define MyAppPublisher "Spark Pair"
#define MyAppExeName "TexTradeOS.exe"

[Setup]
AppId={{B7CC92F9-387C-4E04-91C4-A687BF3B3BE7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\TexTradeOS
DefaultGroupName=TexTradeOS
OutputDir=..\artifacts\installer
OutputBaseFilename=TexTradeOS-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
SetupIconFile=..\launcher\TexTradeOS.Launcher\favicon.ico
UninstallDisplayIcon={app}\TexTradeOS.exe

[Files]
Source: "..\artifacts\launcher\TexTradeOS.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\TexTradeOS"; Filename: "{app}\TexTradeOS.exe"
Name: "{group}\TexTradeOS"; Filename: "{app}\TexTradeOS.exe"

[Run]
Filename: "{app}\TexTradeOS.exe"; Description: "Launch TexTradeOS"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'),
    '/C taskkill /F /IM TexTradeOS.exe >nul 2>&1',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
