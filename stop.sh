#!/bin/bash

# Outline Development Stop Script
# This script stops all development services

echo "🛑 Stopping Outline Development Environment..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Find and kill yarn dev:watch processes
echo "📦 Stopping development servers..."
YARN_PIDS=$(pgrep -f "yarn dev:watch" || true)
if [ -n "$YARN_PIDS" ]; then
    for pid in $YARN_PIDS; do
        kill $pid 2>/dev/null && echo "   ✅ Stopped yarn dev:watch (PID: $pid)"
    done
    sleep 2
else
    echo "   ℹ️  No yarn dev:watch processes running"
fi

# Kill any node processes on ports 3000 and 3001
for PORT in 3000 3001; do
    NODE_PID=$(lsof -ti:$PORT 2>/dev/null || true)
    if [ -n "$NODE_PID" ]; then
        kill $NODE_PID 2>/dev/null && echo "   ✅ Killed process on port $PORT (PID: $NODE_PID)" || true
        sleep 1
    fi
done

# Stop Docker services
echo ""
echo "🐳 Stopping Docker services..."
docker-compose down

echo ""
echo "✅ All services stopped successfully"
echo ""
echo "💡 Run './start.sh' to start the development environment again"
