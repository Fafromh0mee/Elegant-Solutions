@echo off
setlocal EnableExtensions
set "SERVICE_NAME=ElegantSolutionsMachine"
set "SOURCE_SERVICE=%~dp0dist\ElegantAgentService.exe"
set "SOURCE_UI=%~dp0dist\ElegantAgentUI.exe"
set "INSTALL_DIR=%ProgramFiles%\ElegantSolution\Agent"
set "DATA_DIR=%ProgramData%\ElegantSolution\Agent"
set "BRIDGE_DIR=%ProgramData%\ElegantSolution\AgentBridge"
set "INSTALL_SERVICE=%INSTALL_DIR%\ElegantAgentService.exe"
set "INSTALL_UI=%INSTALL_DIR%\ElegantAgentUI.exe"

net session >nul 2>&1
if errorlevel 1 (echo ERROR: Run setup.bat as Administrator.& exit /b 1)
if not exist "%SOURCE_SERVICE%" (echo ERROR: Service executable missing.& exit /b 1)
if not exist "%SOURCE_UI%" (echo ERROR: UI executable missing.& exit /b 1)
if not exist "%~dp0deployment.json" (echo ERROR: deployment.json missing.& exit /b 1)

sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    sc stop "%SERVICE_NAME%" >nul 2>&1
    powershell.exe -NoProfile -Command "for($i=0;$i -lt 30;$i++){ $s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue; if(-not $s -or $s.Status -eq 'Stopped'){exit 0}; Start-Sleep -Seconds 1 }; exit 1"
    if errorlevel 1 (echo ERROR: Existing service did not stop; update aborted.& exit /b 1)
)
schtasks /End /TN "ElegantSolutionsAgent" >nul 2>&1
schtasks /Delete /TN "ElegantSolutionsAgent" /F >nul 2>&1
if exist "%~dp0stop_agent.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_agent.ps1" -ExecutablePath "%INSTALL_DIR%\ElegantAgent.exe"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_agent.ps1" -ExecutablePath "%INSTALL_UI%"
)

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"
icacls "%DATA_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" >nul
if errorlevel 1 (echo ERROR: Could not protect machine credentials.& exit /b 1)
icacls "%BRIDGE_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" >nul
if errorlevel 1 (echo ERROR: Could not protect bridge token.& exit /b 1)

copy /Y "%SOURCE_SERVICE%" "%INSTALL_SERVICE%" >nul
if errorlevel 1 exit /b 1
copy /Y "%SOURCE_UI%" "%INSTALL_UI%" >nul
if errorlevel 1 exit /b 1
copy /Y "%~dp0deployment.json" "%INSTALL_DIR%\deployment.json" >nul
if errorlevel 1 exit /b 1
copy /Y "%~dp0stop_agent.ps1" "%INSTALL_DIR%\stop_agent.ps1" >nul
copy /Y "%~dp0remove_hosts.ps1" "%INSTALL_DIR%\remove_hosts.ps1" >nul
copy /Y "%~dp0uninstall.bat" "%INSTALL_DIR%\uninstall.bat" >nul
copy /Y "%~dp0restart.bat" "%INSTALL_DIR%\restart.bat" >nul

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    "%INSTALL_SERVICE%" --startup auto install
    if errorlevel 1 (echo ERROR: Windows Service registration failed.& exit /b 1)
)
sc config "%SERVICE_NAME%" start= auto >nul
sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/5000/restart/5000/restart/30000 >nul
powershell.exe -NoProfile -Command "New-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name ElegantAgentUI -Value ([char]34 + '%INSTALL_UI%' + [char]34) -PropertyType String -Force" >nul
if errorlevel 1 (echo ERROR: User-session startup registration failed.& exit /b 1)
sc start "%SERVICE_NAME%" >nul
if errorlevel 1 (echo ERROR: Machine Service did not start.& exit /b 1)

start "" "%INSTALL_UI%"
echo Installation complete. Machine Service is automatic; UI starts at user login.
endlocal
