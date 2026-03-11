@echo off
title WhatsApp Bot Setup (Windows)
color 0A

echo ==========================================
echo    WhatsApp Auto-Moderator Installer
echo ==========================================
echo.

echo [INFO] Checking Node.js version...
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v

if "%NODE_VER%"=="v20.20.0" (
    echo [INFO] Perfect! Node.js v20.20.0 is already installed.
    goto INSTALL_DEPS
)

echo [WARN] Required Node.js v20.20.0 not found (Current: %NODE_VER%).
echo [INFO] Downloading Node.js v20.20.0 directly from official servers...
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.20.0/node-v20.20.0-x64.msi' -OutFile 'node_installer.msi'"

echo [INFO] Installing Node.js v20.20.0... (Please wait, a Windows setup progress bar may appear)
msiexec.exe /i node_installer.msi /passive

echo [INFO] Cleaning up...
del node_installer.msi

echo.
echo [SUCCESS] Node.js v20.20.0 installed successfully!
echo ==========================================
echo [ACTION REQUIRED] The system needs to refresh its variables.
echo Please close this terminal window, and double-click "install_windows.bat" again to finish setup.
pause
exit

:INSTALL_DEPS
echo [INFO] Installing required packages...
call npm install

echo.
echo [SUCCESS] Installation Complete!
echo [INFO] Starting the bot...
echo ==========================================
node index.js
pause