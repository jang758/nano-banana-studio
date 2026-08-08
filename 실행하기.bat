@echo off
cd /d "%~dp0"

echo 1. 엔진 시동을 겁니다... (이 검은 창은 최소화 해두세요)
start "AI_Engine" npm run dev

echo 2. 엔진이 예열될 때까지 5초만 기다립니다...
timeout /t 5 >nul

echo 3. 앱 화면을 띄웁니다!
python view.py

echo 4. 앱을 종료하여 엔진을 끕니다.
taskkill /F /FI "WINDOWTITLE eq AI_Engine*"