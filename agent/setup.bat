@echo off
:: Run this script as Administrator on each Windows machine
:: It registers ElegantAgent.exe to run automatically on user login

setlocal

set AGENT_EXE=%~dp0dist\ElegantAgent.exe

if not exist "%AGENT_EXE%" (
    echo ERROR: %AGENT_EXE% not found.
    echo Please run build.bat first.
    pause
    exit /b 1
)

echo ====================================
echo  Elegant Agent - Setup
echo ====================================

:: Create scheduled task that runs on any user login at highest privilege
echo [1/2] Creating scheduled task...
schtasks /Create /F /SC ONLOGON /TN "ElegantSolutionsAgent" /TR "\"%AGENT_EXE%\"" /RL HIGHEST /DELAY 0000:10

if %ERRORLEVEL% EQU 0 (
    echo [2/2] Task created successfully.
    echo Agent will start automatically on next login.
) else (
    echo [2/2] Failed to create task. Make sure you are running as Administrator.
    pause
    exit /b 1
)

:: Optionally start now without waiting for reboot
echo Starting agent now...
start "" "%AGENT_EXE%"

endlocal
pause
