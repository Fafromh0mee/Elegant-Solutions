@echo off
setlocal EnableExtensions
set "SERVICE_NAME=ElegantSolutionsMachine"
set "DATA_DIR=%ProgramData%\ElegantSolution\Agent"
net session >nul 2>&1
if errorlevel 1 (echo ERROR: Run as Administrator.& exit /b 1)
set /p "MAINT_CODE=Enter the RESTART_AGENT Maintenance Code: "
set "MAINT_AUTH="
for /f "usebackq delims=" %%A in (`powershell.exe -NoProfile -Command "if($env:MAINT_CODE -notmatch '^[0-9]{6}$'){exit 1}; $c=Get-Content -Raw -LiteralPath '%DATA_DIR%\config.json' ^| ConvertFrom-Json; $body=@{code=$env:MAINT_CODE; action='RESTART_AGENT'} ^| ConvertTo-Json -Compress; try {$r=Invoke-RestMethod -Method Post -Uri ($c.server_url.TrimEnd('/')+'/api/agent/maintenance/authorize') -Headers @{'x-agent-key'=$c.api_key} -ContentType 'application/json' -Body $body -TimeoutSec 10; if($r.authorized){'OK'}} catch {}"`) do set "MAINT_AUTH=%%A"
if /I not "%MAINT_AUTH%"=="OK" (echo ERROR: Server rejected the Maintenance Code.& exit /b 1)
sc stop "%SERVICE_NAME%" >nul
powershell.exe -NoProfile -Command "for($i=0;$i -lt 30;$i++){ $s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue; if(-not $s -or $s.Status -eq 'Stopped'){exit 0}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (echo ERROR: Service did not stop; restart aborted.& exit /b 1)
sc start "%SERVICE_NAME%"
if errorlevel 1 exit /b 1
echo Agent service restarted.
endlocal
