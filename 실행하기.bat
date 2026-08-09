@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo Nano Banana Studio 엔진을 시작합니다...
for /f %%P in ('powershell -NoProfile -Command "$p = Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/vite/bin/vite.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru; $p.Id"') do set "ENGINE_PID=%%P"
powershell -NoProfile -Command "$ready = $false; 1..40 | ForEach-Object { try { if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 1).StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 250 }; if (-not $ready) { exit 1 }"
if errorlevel 1 (
  echo 엔진을 시작하지 못했습니다.
  if defined ENGINE_PID taskkill /PID %ENGINE_PID% /T /F >nul 2>&1
  pause
  exit /b 1
)
python view.py / "Nano Banana Studio - 기존 분석"
if defined ENGINE_PID taskkill /PID %ENGINE_PID% /T /F >nul 2>&1
endlocal
