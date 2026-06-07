@echo off
cd /d "%~dp0"

if not exist .env (
  copy .env.example .env >nul
)

findstr /C:"USE_MEMORY_DB=true" .env >nul
if not errorlevel 1 (
  echo Starting FreshMart backend in local memory mode...
  echo No PostgreSQL setup is required for this mode.
  npm run dev
  exit /b %errorlevel%
)

echo Checking PostgreSQL on localhost:5432...
powershell -NoProfile -Command "if ((Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) { exit 0 } else { exit 1 }"

if errorlevel 1 (
  echo.
  echo PostgreSQL is not running on localhost:5432.
  echo.
  echo Start PostgreSQL first, then run:
  echo   npm run db:migrate
  echo   npm run db:seed
  echo   npm run dev
  echo.
  echo If Docker Desktop is installed, you can run:
  echo   docker compose up -d
  echo.
  pause
  exit /b 1
)

echo PostgreSQL detected.
npm run db:migrate
npm run db:seed
npm run dev
