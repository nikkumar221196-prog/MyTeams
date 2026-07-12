@echo off
echo 🚀 MyTeams Deployment Script
echo ==============================

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js and npm are installed

REM Install dependencies
echo 📦 Installing dependencies...
npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

REM Install Vercel CLI if not present
vercel --version >nul 2>&1
if errorlevel 1 (
    echo 📦 Installing Vercel CLI...
    npm install -g vercel
)

echo 🚀 Ready to deploy!
echo.
echo Choose your deployment option:
echo 1. Vercel (Recommended) - Run: vercel
echo 2. Railway - Visit: https://railway.app
echo 3. Render - Visit: https://render.com
echo.
echo For Vercel deployment, run:
echo vercel
echo.
echo Your app will be live in minutes! 🎉
pause