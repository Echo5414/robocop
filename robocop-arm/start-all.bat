@echo off
REM Start both bridge and dev servers

echo Starting RoboCop Arm servers...

REM Start bridge server in new window
start "Bridge Server" cmd /k "npm run bridge"

REM Wait a moment for bridge to initialize
timeout /t 3 /nobreak

REM Start dev server in new window
start "Dev Server" cmd /k "npm run dev"

echo.
echo ========================================
echo Both servers are starting!
echo.
echo Bridge Server: ws://localhost:8080
echo Dev Server: http://localhost:5173
echo Bridge UI: http://localhost:5173/bridge
echo.
echo Close the windows to stop the servers
echo ========================================
