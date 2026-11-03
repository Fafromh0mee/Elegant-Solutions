@echo off
setlocal EnableExtensions

set "TASK_NAME=ElegantSolutionsAgent"
set "INSTALL_DIR=%ProgramFiles%\ElegantSolution\Agent"
set "DATA_DIR=%ProgramData%\ElegantSolution\Agent"
set "HOST_CLEANUP=%INSTALL_DIR%\remove_hosts.ps1"
set "PROCESS_STOP=%INSTALL_DIR%\stop_agent.ps1"
if not exist "%HOST_CLEANUP%" set "HOST_CLEANUP=%~dp0remove_hosts.ps1"
if not exist "%PROCESS_STOP%" set "PROCESS_STOP=%~dp0stop_agent.ps1"

net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: uninstall.bat must be run as Administrator.
    exit /b 1
)

echo ====================================
echo  Elegant Agent - Pilot Uninstall
echo ====================================

set /p "MAINT_CODE=Enter the server-issued UNINSTALL_AGENT Maintenance Code: "
if "%MAINT_CODE%"=="" (
    echo ERROR: Maintenance Code is required.
    exit /b 1
)
set "MAINT_AUTH="
for /f "usebackq delims=" %%A in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-Content -Raw -LiteralPath '%DATA_DIR%\config.json' ^| ConvertFrom-Json; $body=@{code='%MAINT_CODE%'; action='UNINSTALL_AGENT'} ^| ConvertTo-Json -Compress; try {$r=Invoke-RestMethod -Method Post -Uri ($c.server_url.TrimEnd('/')+'/api/agent/maintenance/authorize') -Headers @{'x-agent-key'=$c.api_key} -ContentType 'application/json' -Body $body -TimeoutSec 10; if($r.authorized){'OK'}} catch {}"`) do set "MAINT_AUTH=%%A"
if /I not "%MAINT_AUTH%"=="OK" (
    echo ERROR: Server rejected the Maintenance Code.
    exit /b 1
)
echo Maintenance authorization accepted.

echo Stopping the Scheduled Task and Agent process...
schtasks /End /TN "%TASK_NAME%" >nul 2>&1
if exist "%PROCESS_STOP%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROCESS_STOP%" -ExecutablePath "%INSTALL_DIR%\ElegantAgent.exe"
    if errorlevel 1 (
        echo ERROR: Could not terminate the installed Agent process.
        exit /b 1
    )
) else (
    echo WARNING: Process cleanup helper not found; using the exact Agent image name.
    taskkill /IM ElegantAgent.exe /T /F >nul 2>&1
)

echo Removing Scheduled Task...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

if not exist "%HOST_CLEANUP%" (
    echo ERROR: Hosts-file cleanup helper not found; refusing to remove files.
    exit /b 1
)
echo Removing only ElegantAgent-managed hosts entries...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HOST_CLEANUP%"
if errorlevel 1 (
    echo ERROR: Hosts-file cleanup failed; unrelated hosts entries were not targeted.
    exit /b 1
)

echo Removing Agent configuration, API key, logs, and installed files...
if exist "%DATA_DIR%" rmdir /s /q "%DATA_DIR%"
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
if exist "%DATA_DIR%" (
    echo ERROR: Could not remove the Agent data directory.
    exit /b 1
)
if exist "%INSTALL_DIR%" (
    echo ERROR: Could not remove the Agent installation directory.
    exit /b 1
)

echo.
echo Uninstallation complete.
echo The Scheduled Task, installed executable, local configuration, logs, and managed hosts entries were removed.

endlocal
