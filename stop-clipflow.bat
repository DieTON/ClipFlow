@echo off
title ClipFlow Stop
color 0C
echo.
echo  Stopping ClipFlow...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000.*LISTENING"') do (
  echo Stopping server PID %%a
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do (
  echo Stopping client PID %%a
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174.*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo  App stopped. Docker DB can stay running.
echo  Close any leftover "ClipFlow Server/Client" windows if still open.
echo.
pause
