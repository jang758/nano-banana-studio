@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Nano Banana Studio 엔진을 시작합니다...
start "NanoBanana_Engine" npm run dev
timeout /t 4 >nul
python view.py /compare.html "Nano Banana Studio - 분석 비교"
taskkill /F /FI "WINDOWTITLE eq NanoBanana_Engine*" >nul 2>&1

