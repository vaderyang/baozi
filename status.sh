#!/bin/bash

# Outline Development Status Script
# This script checks the status of all development services

echo "📊 Outline Development Environment Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Docker services
echo "🐳 Docker Services:"
if command -v docker-compose &> /dev/null; then
    DOCKER_RUNNING=$(docker-compose ps 2>&1)

    # Check PostgreSQL
    if echo "$DOCKER_RUNNING" | grep -q "postgres.*Up"; then
        POSTGRES_PORT=$(docker port baozi-postgres-1 5432 2>/dev/null | cut -d: -f2 || echo "5432")
        echo "   ✅ PostgreSQL: Running"
        echo "      Host: 127.0.0.1:$POSTGRES_PORT"
        echo "      Database: outline"
    else
        echo "   ❌ PostgreSQL: Not running"
    fi

    # Check Redis
    if echo "$DOCKER_RUNNING" | grep -q "redis.*Up"; then
        REDIS_PORT=$(docker port baozi-redis-1 6379 2>/dev/null | cut -d: -f2 || echo "6379")
        echo "   ✅ Redis: Running"
        echo "      Host: 127.0.0.1:$REDIS_PORT"
    else
        echo "   ❌ Redis: Not running"
    fi
else
    echo "   ⚠️  docker-compose not found"
fi

echo ""

# Check backend (port 3000)
echo "🔧 Backend Server (Port 3000):"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    BACKEND_PID=$(lsof -ti:3000 || echo "unknown")
    echo "   ✅ Running (PID: $BACKEND_PID)"

    # Test connection
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "      Status: ✅ Responding (HTTP $HTTP_CODE)"
        echo "      URL: http://localhost:3000"
    else
        echo "      Status: ⚠️  Port open but not responding properly (HTTP $HTTP_CODE)"
    fi
else
    echo "   ❌ Not running"
fi

echo ""

# Check frontend (port 3001)
echo "🎨 Frontend Vite Server (Port 3001):"
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    FRONTEND_PID=$(lsof -ti:3001 || echo "unknown")
    echo "   ✅ Running (PID: $FRONTEND_PID)"
    echo "      URL: http://localhost:3001/static/"
else
    echo "   ❌ Not running"
fi

echo ""

# Check for dev processes
echo "📝 Development Processes:"
YARN_PROCS=$(pgrep -f "yarn dev" || true)
NODEMON_PROCS=$(pgrep -f "nodemon" || true)

if [ -n "$YARN_PROCS" ] || [ -n "$NODEMON_PROCS" ]; then
    echo "   ✅ Active processes found:"
    ps aux | grep -E "(yarn dev|nodemon)" | grep -v grep | awk '{printf "      - %s %s %s (PID: %s)\n", $11, $12, $13, $2}'
else
    echo "   ❌ No development processes running"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Overall status
BACKEND_OK=$(lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 && echo "1" || echo "0")
POSTGRES_OK=$(docker ps 2>/dev/null | grep -q "baozi-postgres-1.*Up" && echo "1" || echo "0")
REDIS_OK=$(docker ps 2>/dev/null | grep -q "baozi-redis-1.*Up" && echo "1" || echo "0")

if [ "$BACKEND_OK" = "1" ] && [ "$POSTGRES_OK" = "1" ] && [ "$REDIS_OK" = "1" ]; then
    echo "✅ System Status: All services running"
    echo ""
    echo "🌐 Access the app at: http://localhost:3000"
elif [ "$POSTGRES_OK" = "1" ] && [ "$REDIS_OK" = "1" ]; then
    echo "⚠️  System Status: Docker services running, but dev server not started"
    echo ""
    echo "💡 Run 'yarn dev:watch' or './start.sh' to start the development server"
else
    echo "❌ System Status: Some services not running"
    echo ""
    echo "💡 Run './start.sh' to start all services"
fi

echo ""
echo "🔧 Quick Commands:"
echo "   Start:  ./start.sh"
echo "   Stop:   ./stop.sh"
echo "   Status: ./status.sh"
