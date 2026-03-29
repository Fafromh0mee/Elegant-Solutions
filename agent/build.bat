@echo off
setlocal

echo ====================================
echo  Elegant Agent - Build Script
echo ====================================

:: Install dependencies
echo [1/3] Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

:: Build
echo [2/3] Building executable...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name ElegantAgent ^
  --add-data "src;src" ^
  --paths src ^
  src\main.py

:: Result
echo [3/3] Done!
if exist dist\ElegantAgent.exe (
    echo Build successful: dist\ElegantAgent.exe
) else (
    echo Build FAILED — check output above
    exit /b 1
)

endlocal
pause
