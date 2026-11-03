@echo off
setlocal EnableExtensions

set "TASK_NAME=ElegantSolutionsAgent"
set "SOURCE_EXE=%~dp0dist\ElegantAgent.exe"
set "SOURCE_HOST_CLEANUP=%~dp0remove_hosts.ps1"
set "SOURCE_PROCESS_STOP=%~dp0stop_agent.ps1"
set "SOURCE_DEPLOYMENT=%~dp0deployment.json"
set "INSTALL_DIR=%ProgramFiles%\ElegantSolution\Agent"
set "DATA_DIR=%ProgramData%\ElegantSolution\Agent"
set "INSTALL_EXE=%INSTALL_DIR%\ElegantAgent.exe"

net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: setup.bat must be run as Administrator.
    exit /b 1
)

if not exist "%SOURCE_EXE%" (
    echo ERROR: %SOURCE_EXE% not found.
    echo Run build.bat first and keep the dist directory beside setup.bat.
    exit /b 1
)

if not exist "%SOURCE_HOST_CLEANUP%" (
    echo ERROR: %SOURCE_HOST_CLEANUP% not found.
    echo The deployment package is incomplete.
    exit /b 1
)

if not exist "%SOURCE_PROCESS_STOP%" (
    echo ERROR: %SOURCE_PROCESS_STOP% not found.
    echo The deployment package is incomplete.
    exit /b 1
)

if not exist "%SOURCE_DEPLOYMENT%" (
    echo ERROR: %SOURCE_DEPLOYMENT% not found.
    echo The deployment package must contain the non-secret deployment URL configuration.
    exit /b 1
)

echo ====================================
echo  Elegant Agent - Pilot Install
echo ====================================
echo Install directory: %INSTALL_DIR%
echo Data directory:    %DATA_DIR%

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if errorlevel 1 (
    echo ERROR: Could not create the install directory.
    exit /b 1
)
if not exist "%DATA_DIR%\logs" mkdir "%DATA_DIR%\logs"
if errorlevel 1 (
    echo ERROR: Could not create the data directory.
    exit /b 1
)

if exist "%INSTALL_EXE%" (
    echo Stopping the existing installed Agent before update...
    schtasks /End /TN "%TASK_NAME%" >nul 2>&1
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SOURCE_PROCESS_STOP%" -ExecutablePath "%INSTALL_EXE%"
    if errorlevel 1 (
        echo ERROR: Could not stop the existing installed Agent.
        exit /b 1
    )
)

echo Copying the executable...
copy /Y "%SOURCE_EXE%" "%INSTALL_EXE%" >nul
if errorlevel 1 (
    echo ERROR: Could not copy ElegantAgent.exe.
    exit /b 1
)

:: The cleanup helper is installed without copying config.json or any .env file.
copy /Y "%SOURCE_HOST_CLEANUP%" "%INSTALL_DIR%\remove_hosts.ps1" >nul
if errorlevel 1 (
    echo ERROR: Could not install the hosts-file cleanup helper.
    exit /b 1
)
copy /Y "%SOURCE_PROCESS_STOP%" "%INSTALL_DIR%\stop_agent.ps1" >nul
if errorlevel 1 (
    echo ERROR: Could not install the process cleanup helper.
    exit /b 1
)
copy /Y "%SOURCE_DEPLOYMENT%" "%INSTALL_DIR%\deployment.json" >nul
if errorlevel 1 (
    echo ERROR: Could not install the deployment URL configuration.
    exit /b 1
)

echo Creating Scheduled Task %TASK_NAME%...
schtasks /Create /F /SC ONLOGON /TN "%TASK_NAME%" /TR "\"%INSTALL_EXE%\"" /RL HIGHEST /DELAY 0000:10
if errorlevel 1 (
    echo ERROR: Could not create the Scheduled Task.
    exit /b 1
)

echo Starting the Agent...
schtasks /Run /TN "%TASK_NAME%" >nul
if errorlevel 1 (
    echo WARNING: The Scheduled Task was created, but the Agent could not be started now.
    echo It will start automatically at the next user logon.
    exit /b 0
)

echo.
echo Installation complete.
echo The Agent will start automatically at user logon.
echo Machine configuration is created on first run under:
echo   %DATA_DIR%\config.json
echo The deployment server URL is read from:
echo   %INSTALL_DIR%\deployment.json

endlocal
