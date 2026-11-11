@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if "%ELEGANT_SERVER_URL%"=="" (
    echo ERROR: Set ELEGANT_SERVER_URL to the server HTTPS URL.
    exit /b 1
)
set "PYTHON=python"
%PYTHON% --version >nul 2>&1
if errorlevel 1 exit /b 1
%PYTHON% -c "import sys; assert sys.version_info[:2] == (3, 12), 'Python 3.12 required'"
if errorlevel 1 exit /b 1
%PYTHON% -m venv .build-venv-windows
if errorlevel 1 exit /b 1
set "PYTHON=.build-venv-windows\Scripts\python.exe"

%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
%PYTHON% -m pip install PyInstaller==6.11.1
if errorlevel 1 exit /b 1

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release

%PYTHON% -m PyInstaller --noconfirm --clean --onefile --name ElegantAgentService --paths src --hidden-import win32timezone src\windows_service.py
if errorlevel 1 exit /b 1
%PYTHON% -m PyInstaller --noconfirm --clean --onefile --windowed --name ElegantAgentUI --paths src src\session_ui.py
if errorlevel 1 exit /b 1

if not exist "dist\ElegantAgentService.exe" exit /b 1
if not exist "dist\ElegantAgentUI.exe" exit /b 1
mkdir "release\dist"
copy /Y "dist\ElegantAgentService.exe" "release\dist\ElegantAgentService.exe" >nul
copy /Y "dist\ElegantAgentUI.exe" "release\dist\ElegantAgentUI.exe" >nul
copy /Y "setup.bat" "release\setup.bat" >nul
copy /Y "uninstall.bat" "release\uninstall.bat" >nul
copy /Y "restart.bat" "release\restart.bat" >nul
copy /Y "stop_agent.ps1" "release\stop_agent.ps1" >nul
copy /Y "remove_hosts.ps1" "release\remove_hosts.ps1" >nul
copy /Y "README.md" "release\README.md" >nul
powershell.exe -NoProfile -Command "$url=$env:ELEGANT_SERVER_URL.Trim().TrimEnd('/'); @{server_url=$url} | ConvertTo-Json | Set-Content -Encoding UTF8 'release\deployment.json'"
if errorlevel 1 exit /b 1

set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=ISCC.exe"
"%ISCC%" setup.iss
if errorlevel 1 (echo ERROR: Inno Setup 6 is required to build the installer EXE.& exit /b 1)
%PYTHON% -c "import hashlib,pathlib; p=pathlib.Path('release'); files=[x for x in p.rglob('*') if x.is_file() and x.name!='SHA256SUMS.txt']; (p/'SHA256SUMS.txt').write_bytes(''.join(hashlib.sha256(x.read_bytes()).hexdigest()+'  '+x.relative_to(p).as_posix()+'\n' for x in sorted(files)).encode('utf-8'))"
if errorlevel 1 exit /b 1
echo Built release\ElegantAgentSetup_0.5.0_x64.exe
endlocal
