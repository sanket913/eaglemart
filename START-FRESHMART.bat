@echo off
cd /d "%~dp0"
echo Starting FreshMart Express...
echo.
echo Customer: http://127.0.0.1:5173
echo Admin:    http://127.0.0.1:5173/admin
echo.
start "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:5173"
npm run start
