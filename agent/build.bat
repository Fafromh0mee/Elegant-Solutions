@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ====================================
echo  Elegant Agent - Pilot Build
echo ====================================

where py >nul 2>&1
if errorlevel 1 (
    set "PYTHON=python"
) else (
    set "PYTHON=py -3"
)

%PYTHON% --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3 was not found.
    exit /b 1
)

if "%ELEGANT_SERVER_URL%"=="" (
    echo ERROR: Set ELEGANT_SERVER_URL to the deployed non-secret server URL before building.
    exit /b 1
)

echo [1/4] Installing pinned dependencies...
%PYTHON% -m pip install --requirement requirements.txt
if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    exit /b 1
)

%PYTHON% -m pip install PyInstaller==6.11.1
if errorlevel 1 (
    echo ERROR: PyInstaller installation failed.
    exit /b 1
)

echo [2/4] Cleaning generated build output...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "ElegantAgent.spec" del /q "ElegantAgent.spec"

echo [3/4] Building executable...
%PYTHON% -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --windowed ^
  --name ElegantAgent ^
  --add-data "src;src" ^
  --paths src ^
  src\main.py
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    exit /b 1
)

if exist "build" rmdir /s /q "build"
if exist "ElegantAgent.spec" del /q "ElegantAgent.spec"

if not exist "dist\ElegantAgent.exe" (
    echo ERROR: dist\ElegantAgent.exe was not produced.
    exit /b 1
)

for /f "delims=" %%F in ('dir /b /a-d "dist" 2^>nul') do (
    if /I not "%%F"=="ElegantAgent.exe" (
        echo ERROR: Unexpected file in dist: %%F
        exit /b 1
    )
)
for /f "delims=" %%D in ('dir /b /ad "dist" 2^>nul') do (
    echo ERROR: Unexpected directory in dist: %%~nxD
    exit /b 1
)

echo [4/4] Staging clean pilot release...
if exist "release" rmdir /s /q "release"
mkdir "release\dist"
if errorlevel 1 (
    echo ERROR: Could not create the release directory.
    exit /b 1
)
copy /Y "dist\ElegantAgent.exe" "release\dist\ElegantAgent.exe" >nul
copy /Y "setup.bat" "release\setup.bat" >nul
copy /Y "uninstall.bat" "release\uninstall.bat" >nul
copy /Y "remove_hosts.ps1" "release\remove_hosts.ps1" >nul
copy /Y "stop_agent.ps1" "release\stop_agent.ps1" >nul
copy /Y "README.md" "release\README.md" >nul
powershell.exe -NoProfile -Command "$url = $env:ELEGANT_SERVER_URL.Trim().TrimEnd('/'); @{ server_url = $url } | ConvertTo-Json | Set-Content -Encoding UTF8 'release\deployment.json'"
if errorlevel 1 (
    echo ERROR: Could not stage the pilot release.
    exit /b 1
)

echo.
echo Build successful: %CD%\dist\ElegantAgent.exe
echo Pilot release staged at: %CD%\release
echo The non-secret deployment.json contains only the server URL; no config.json, .env, API key, or registration secret is copied.

endlocal
