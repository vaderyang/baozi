#!/bin/bash

# Outline Development Start Script
# This script starts the Outline application in development mode

echo "🚀 Starting Outline (Development Mode)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if .env exists, if not use .env.development
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Using .env.development..."
    if [ -f .env.development ]; then
        cp .env.development .env
        echo "✅ Created .env from .env.development"
    else
        echo "❌ No .env.development found either!"
        exit 1
    fi
fi

echo ""
echo "📦 Starting Docker services (PostgreSQL & Redis)..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Check if database is accessible
RETRIES=0
MAX_RETRIES=10
until PGPASSWORD=pass psql -h 127.0.0.1 -U user -d outline -c "SELECT 1;" > /dev/null 2>&1; do
    RETRIES=$((RETRIES+1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
        echo "❌ PostgreSQL failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "   Still waiting for PostgreSQL... ($RETRIES/$MAX_RETRIES)"
    sleep 2
done

echo "✅ PostgreSQL is ready"
echo "✅ Redis is ready"
echo ""

# Start development server
echo "🔧 Starting development server..."
echo "   Backend will be available at: http://localhost:3000"
echo "   Frontend (Vite) will be available at: http://localhost:3001"
echo ""
echo "📝 Server logs will be shown below."
echo "   Press Ctrl+C to stop the servers (Docker will keep running)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the dev server (foreground)
yarn dev:watch
