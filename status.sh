#!/bin/bash

# Outline Wiki Status Script
# This script checks the status of Outline and its dependencies

echo "📊 Outline Wiki Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Outline processes
OUTLINE_PIDS=$(pgrep -f "node.*build/server/index.js" || true)

if [ -n "$OUTLINE_PIDS" ]; then
    echo "✅ Outline is RUNNING (PID: $OUTLINE_PIDS)"
    echo "   URL: http://172.16.11.67:3000"
else
    echo "❌ Outline is NOT running"
fi

echo ""
echo "📋 Dependencies Status:"

# Check PostgreSQL
if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "✅ PostgreSQL is running (127.0.0.1:5432)"
else
    echo "❌ PostgreSQL is not accessible"
fi

# Check Redis
if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "✅ Redis is running (127.0.0.1:6379)"
else
    echo "❌ Redis is not accessible"
fi

# Check build directory
if [ -d "build" ]; then
    echo "✅ Build directory exists"
else
    echo "❌ Build directory missing"
fi

# Check if port is in use
if netstat -tuln 2>/dev/null | grep -q ":3000 "; then
    echo "✅ Port 3000 is in use"
else
    echo "⚠️  Port 3000 is free"
fi

echo ""
echo "🔧 Quick Commands:"
echo "   Start:  ./start.sh"
echo "   Stop:   ./stop.sh"
echo "   Status: ./status.sh"
echo "   Logs:   tail -f logs/outline.log (if using PM2 or systemd)"


# Check backup status
echo ""
echo "💾 Backup Status:"
BACKUP_DIR="/home/vader/backups/outline"
if [ -d "$BACKUP_DIR" ]; then
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/outline_backup_*.tar.gz 2>/dev/null | wc -l)
    if [ $BACKUP_COUNT -gt 0 ]; then
        LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/outline_backup_*.tar.gz 2>/dev/null | head -1)
        BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
        echo "✅ $BACKUP_COUNT backups available (Total: $BACKUP_SIZE)"
        echo "   Latest: $(basename "$LATEST_BACKUP")"
    else
        echo "⚠️  No backups found"
    fi
else
    echo "⚠️  Backup directory not created"
fi

# Check automated backup schedule
if crontab -l 2>/dev/null | grep -q "backup-cron.sh"; then
    echo "✅ Automated backup is scheduled"
else
    echo "⚠️  No automated backup scheduled"
fi

echo ""
echo "🛠️  Backup Commands:"
echo "   Create backup:    ./backup.sh"
echo "   Manage backups:   ./backup-manage.sh list"
echo "   Setup automated:  ./backup-manage.sh schedule"
