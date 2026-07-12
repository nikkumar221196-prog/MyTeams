#!/bin/bash

# MyTeams Deployment Script

echo "🚀 MyTeams Deployment Script"
echo "=============================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Test the application locally
echo "🧪 Testing application locally..."
npm start &
SERVER_PID=$!

# Wait a moment for server to start
sleep 5

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server is running successfully on http://localhost:3000"
    echo "🛑 Stopping test server..."
    kill $SERVER_PID
else
    echo "❌ Server failed to start"
    exit 1
fi

# Install Vercel CLI if not present
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

echo "🚀 Ready to deploy!"
echo ""
echo "Choose your deployment option:"
echo "1. Vercel (Recommended) - Run: vercel"
echo "2. Railway - Visit: https://railway.app"
echo "3. Render - Visit: https://render.com"
echo ""
echo "For Vercel deployment, run:"
echo "vercel"
echo ""
echo "Your app will be live in minutes! 🎉"