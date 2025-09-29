#!/bin/bash

# Outline Wiki Start Script
# This script starts the Outline application in production mode

echo "🚀 Starting Outline Wiki..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if services are running
echo "📋 Checking prerequisites..."

# Check if PostgreSQL is running
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on 127.0.0.1:5432"
    echo "   Please ensure PostgreSQL is started"
    exit 1
else
    echo "✅ PostgreSQL is running"
fi

# Check if Redis is running  
if ! redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "❌ Redis is not running on 127.0.0.1:6379"
    echo "   Please ensure Redis is started"
    exit 1
else
    echo "✅ Redis is running"
fi

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found"
    echo "   Please run 'yarn build' first"
    exit 1
else
    echo "✅ Build directory exists"
fi

echo ""
echo "🌐 Starting Outline server..."
echo "   URL: http://172.16.11.67:3000"
echo "   Mode: Production"
echo "   Press Ctrl+C to stop"
echo ""

# Start the application
NODE_ENV=production yarn start

