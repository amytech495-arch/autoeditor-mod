@echo off
setlocal
cd /d "%~dp0"

REM Prefer a bundled portable Node (runtime\node.exe); fall back to system Node.
set "NODE=%~dp0runtime\node.exe"
if not exist "%NODE%" (
  set "NODE=node"
  where node >nul 2>nul
  if errorlevel 1 (
    call :fail "Node.js was not found on this computer.|Please install the Node.js LTS version from https://nodejs.org and run start.bat again."
  )
)

REM First run: install backend dependencies (needs npm on PATH; skipped in the
REM prebuilt distributable where server\node_modules already ships).
if not exist "server\node_modules" (
  where npm >nul 2>nul
  if errorlevel 1 (
    call :fail "npm was not found on this computer.|Node.js and npm are required to install dependencies.|Please install the Node.js LTS version from https://nodejs.org and run start.bat again."
  )
  echo Installing render engine dependencies...
  pushd server
  call npm install
  if errorlevel 1 (
    popd
    call :fail "Failed to install the render engine dependencies.|Please check your internet connection and run start.bat again."
  )
  popd
)

REM First run: build the app UI (skipped in the prebuilt distributable where
REM out\index.html already ships).
if not exist "out\index.html" (
  if not exist "node_modules" (
    where npm >nul 2>nul
    if errorlevel 1 (
      call :fail "npm was not found on this computer.|Node.js and npm are required to install dependencies.|Please install the Node.js LTS version from https://nodejs.org and run start.bat again."
    )
    call npm install
    if errorlevel 1 (
      call :fail "Failed to install the app dependencies.|Please check your internet connection and run start.bat again."
    )
  )
  echo Building the app ^(first run only^)...
  call npm run build
  if errorlevel 1 (
    call :fail "Failed to build the app.|See the messages in the window for details, then run start.bat again."
  )
)

echo.
echo ============================================================
echo   Story-to-Video is starting at http://localhost:4000
echo   Your browser will open automatically.
echo.
echo   To STOP the app: close this window, or press Ctrl+C.
echo   KEEP THIS WINDOW OPEN while you use the app.
echo ============================================================
echo.

REM Run the server in THIS window (foreground) so the window stays open and
REM closing it stops the app. The server opens the browser itself once ready.
set "OPEN_BROWSER=1"
"%NODE%" server\index.js
exit /b 0

REM ---------------------------------------------------------------
REM :fail  Show a blocking error popup and stop. Message is the
REM first argument; use ^| to separate lines in the popup.
REM ---------------------------------------------------------------
:fail
setlocal
set "MSG=%~1"
powershell -NoProfile -Command "$m=($env:MSG -split '\|') -join [char]10; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($m,'Story-to-Video - Setup Error','OK','Error') | Out-Null"
endlocal
exit 1
