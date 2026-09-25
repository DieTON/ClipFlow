@echo off
title ClipFlow Launcher
color 0B
echo.
echo  ========================================
echo   ClipFlow - Starting...
echo  ========================================
echo.

REM Start Docker containers (Postgres + Redis)
echo [1/4] Starting Docker databases...
docker start clipflow-postgres >nul 2>&1
docker start clipflow-redis >nul 2>&1
timeout /t 3 /nobreak >nul

REM Kill anything already on ports 5000 / 5173 (optional clean start)
echo [2/4] Checking ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [3/4] Starting server (port 5000)...
start "ClipFlow Server" cmd /k "cd /d %USERPROFILE%\ClipFlow\server && npm run dev"

timeout /t 4 /nobreak >nul

echo [4/4] Starting client (port 5173)...
start "ClipFlow Client" cmd /k "cd /d %USERPROFILE%\ClipFlow\client && npm run dev"

timeout /t 5 /nobreak >nul

echo.
echo  Opening browser...
start http://localhost:5173

echo.
echo  ========================================
echo   Done!
echo   - Keep the two black windows open
echo   - App: http://localhost:5173
echo   - To stop: run stop-clipflow.bat
echo  ========================================
echo.
pause
