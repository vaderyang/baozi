#!/bin/bash

# Outline Wiki Stop Script
# This script stops the Outline application

echo "🛑 Stopping Outline Wiki..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Find Outline processes
PIDS=$(pgrep -f "node.*build/server/index.js" || true)

if [ -z "$PIDS" ]; then
    echo "✅ No Outline processes found running"
    exit 0
fi

echo "📋 Found Outline processes: $PIDS"

# Try graceful shutdown first
echo "🔄 Attempting graceful shutdown..."
for pid in $PIDS; do
    if kill -TERM "$pid" 2>/dev/null; then
        echo "   Sent SIGTERM to process $pid"
    fi
done

# Wait for graceful shutdown
sleep 5

# Check if processes are still running
REMAINING=$(pgrep -f "node.*build/server/index.js" || true)

if [ -z "$REMAINING" ]; then
    echo "✅ Outline stopped successfully"
    exit 0
fi

# Force kill if still running
echo "⚠️  Processes still running, force killing..."
for pid in $REMAINING; do
    if kill -KILL "$pid" 2>/dev/null; then
        echo "   Force killed process $pid"
    fi
done

# Final check
sleep 2
FINAL_CHECK=$(pgrep -f "node.*build/server/index.js" || true)

if [ -z "$FINAL_CHECK" ]; then
    echo "✅ Outline stopped successfully"
else
    echo "❌ Some processes may still be running: $FINAL_CHECK"
    echo "   You may need to stop them manually"
    exit 1
fi

