@echo off
chcp 65001 >nul
:: ─────────────────────────────────────────────────────────────
:: build.bat  -  One-click builder for VaultKey.exe
:: HOW TO RUN: Double-click this file in Windows Explorer
::             OR right-click -> "Open with" -> Command Prompt
::             DO NOT run via VS Code terminal or PowerShell
:: ─────────────────────────────────────────────────────────────

echo.
echo ========================================
echo   VaultKey - Build Script
echo ========================================
echo.

:: Step 1: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Make sure Python is installed and on your PATH.
    pause
    exit /b 1
)

:: Step 2: Activate venv if it exists
if exist ".venv\Scripts\activate.bat" (
    echo [1/4] Activating virtual environment...
    call .venv\Scripts\activate.bat
) else (
    echo [1/4] No venv found, using system Python...
)

:: Step 3: Install / upgrade PyInstaller
echo [2/4] Installing PyInstaller...
pip install pyinstaller --quiet
if errorlevel 1 (
    echo [ERROR] Failed to install PyInstaller.
    pause
    exit /b 1
)

:: Step 4: Clean previous build artifacts
echo [3/4] Cleaning previous build...
if exist "dist"  rmdir /s /q dist
if exist "build" rmdir /s /q build

:: Step 5: Run PyInstaller with the spec file
echo [4/4] Building VaultKey.exe - this takes 1-3 minutes...
echo.
pyinstaller vaultkey.spec --noconfirm
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. See errors above.
    pause
    exit /b 1
)

:: Done
echo.
echo ========================================
echo   BUILD SUCCESSFUL
echo ========================================
echo.
echo   Your exe is at:  dist\VaultKey.exe
echo.
echo   To use it:
echo     1. Copy dist\VaultKey.exe wherever you want
echo     2. Copy your passwords.db next to it
echo     3. Double-click VaultKey.exe
echo.
pause
