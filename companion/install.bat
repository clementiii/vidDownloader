@echo off
echo ============================================
echo  Video Downloader Companion App Installer
echo ============================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Please run this installer as Administrator!
    echo Right-click on install.bat and select "Run as administrator"
    pause
    exit /b 1
)

:: Create installation directory
set INSTALL_DIR=C:\viddownloader
set EXTENSION_ID=dhbokoaaoenlmmooohpoacfeaacbkoai
echo Creating installation directory: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy files
echo Copying files...
copy /Y "%~dp0viddownloader_companion.py" "%INSTALL_DIR%\"
copy /Y "%~dp0viddownloader_companion.bat" "%INSTALL_DIR%\"
copy /Y "%~dp0viddownloader.json" "%INSTALL_DIR%\"
copy /Y "%~dp0viddownloader.chromium.json" "%INSTALL_DIR%\"

:: Update the JSON with correct path
echo Updating configuration...
powershell -Command "(Get-Content '%INSTALL_DIR%\viddownloader.json') -replace 'C:\\\\viddownloader\\\\viddownloader_companion.bat', '%INSTALL_DIR:\=\\%\\viddownloader_companion.bat' | Set-Content -Encoding ASCII '%INSTALL_DIR%\viddownloader.json'"
powershell -Command "(Get-Content '%INSTALL_DIR%\viddownloader.chromium.json') -replace 'C:\\\\viddownloader\\\\viddownloader_companion.bat', '%INSTALL_DIR:\=\\%\\viddownloader_companion.bat' | Set-Content -Encoding ASCII '%INSTALL_DIR%\viddownloader.chromium.json'"

:: Register with Firefox (Native Messaging)
echo Registering with Firefox...
reg add "HKLM\SOFTWARE\Mozilla\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.json" /f

:: Also register for current user (in case HKLM doesn't work)
reg add "HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.json" /f

:: Register with Chromium-based browsers (Native Messaging)
echo Registering with Chromium-based browsers...
reg add "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKLM\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKCU\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKLM\SOFTWARE\BraveSoftware\Brave-Browser\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKCU\SOFTWARE\BraveSoftware\Brave-Browser\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKLM\SOFTWARE\Chromium\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f
reg add "HKCU\SOFTWARE\Chromium\NativeMessagingHosts\viddownloader" /ve /t REG_SZ /d "%INSTALL_DIR%\viddownloader.chromium.json" /f

:: Check if Python is installed
echo.
echo Checking Python installation...
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Python is not installed or not in PATH!
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
) else (
    echo Python found!
    
    :: Install yt-dlp
    echo.
    echo Installing yt-dlp...
    pip install --upgrade yt-dlp
    
    if %errorLevel% neq 0 (
        echo WARNING: Failed to install yt-dlp
        echo Please run: pip install yt-dlp
    ) else (
        echo yt-dlp installed successfully!
    )
)

echo.
echo ============================================
echo  Installation Complete!
echo ============================================
echo.
echo Next steps:
echo 1. Load the extension in Chrome/Edge/Brave from chrome://extensions or edge://extensions
echo 2. Make sure Developer mode is enabled, then choose "Load unpacked"
echo 3. Select the vidDownloader folder
echo 4. The companion app is ready to handle downloads!
echo.
pause
