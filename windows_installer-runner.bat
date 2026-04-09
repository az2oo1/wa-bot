@echo off
title WhatsApp Bot Smart Launcher (Windows)
color 0A

echo ==========================================
echo    WhatsApp Auto-Moderator Launcher
echo ==========================================
echo.

:: 1. فحص إصدار نود الحالي
set NODE_VER=none
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v

if "%NODE_VER%"=="v20.20.0" (
    echo [OK] Node.js v20.20.0 is active and correct.
    goto CHECK_PACKAGES
)

:: إذا وصل الكود هنا، فهذا يعني أن الإصدار خاطئ أو غير موجود، ويحتاج صلاحيات مسؤول للتعديل
echo [WARN] Required Node.js v20.20.0 not found (Current: %NODE_VER%).
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Administrative Privileges Required!
    echo To delete the incorrect Node.js version and install the right one,
    echo Please right-click this file and select "Run as Administrator".
    pause
    exit
)

if not "%NODE_VER%"=="none" (
    echo [INFO] Incorrect version detected. Uninstalling existing Node.js...
    :: أوامر الحذف الصامتة من الويندوز
    wmic product where "name like 'Node.js%%'" call uninstall /nointeractive >nul 2>&1
    winget uninstall -e --id OpenJS.NodeJS --silent >nul 2>&1
    echo [SUCCESS] Old Node.js version completely removed.
)

:INSTALL_NODE
echo [INFO] Downloading Node.js v20.20.0 directly from official servers...
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.20.0/node-v20.20.0-x64.msi' -OutFile 'node_installer.msi'"

echo [INFO] Installing Node.js v20.20.0 silently...
msiexec.exe /i node_installer.msi /qn /norestart

echo [INFO] Cleaning up...
del node_installer.msi

echo.
echo [SUCCESS] Node.js v20.20.0 installed successfully!
echo ==========================================
echo [ACTION REQUIRED] System paths have been updated.
echo Please close this black window, and double-click "install_windows.bat" again normally.
pause
exit

:CHECK_PACKAGES
:: 2. التحقق من وجود المكتبات المطلوبة فعليا
if not exist node_modules\ (
    echo [INFO] Installing required packages...
    call npm install
    goto RUN_BOT
)

echo [INFO] Verifying dependencies...
call npm ls multer --depth=0 >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARN] Missing or incomplete dependencies detected. Running npm install...
    call npm install
) else (
    echo [OK] Dependencies are ready.
)

:RUN_BOT
echo.
echo [INFO] Launching the bot...
echo ==========================================
node index.js
pause