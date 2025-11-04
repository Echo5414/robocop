@echo off
REM Kill all robocop-arm servers (dev and bridge)

echo Killing all robocop-arm processes...

REM Kill all node processes on ports 5173-5176 and 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5175') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5176') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do taskkill /F /PID %%a 2>nul

echo Done!
timeout /t 2
