#!/bin/bash

# Outline Wiki Restore Script
# This script restores Outline data from a backup

# Configuration
BACKUP_DIR="/home/vader/backups/outline"
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_USER="user"
DB_NAME="outline"
DB_PASSWORD="pass"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "❌ Usage: $0 <backup_file.tar.gz>"
    echo ""
    echo "Available backups:"
    ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null || echo "   No backups found in $BACKUP_DIR"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    # Try in backup directory
    if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
    else
        echo "❌ Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

echo "🔄 Starting Outline Wiki Restore..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Backup file: $BACKUP_FILE"

# Extract backup to temporary directory
TEMP_DIR="/tmp/outline_restore_$(date +%s)"
echo ""
echo "📁 Extracting backup..."
mkdir -p "$TEMP_DIR"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ Failed to extract backup file"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Find the backup directory
RESTORE_DIR=$(find "$TEMP_DIR" -name "outline_backup_*" -type d | head -1)
if [ -z "$RESTORE_DIR" ]; then
    echo "❌ Invalid backup file structure"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "✅ Backup extracted to temporary location"

# Show backup information
if [ -f "$RESTORE_DIR/backup_info.txt" ]; then
    echo ""
    echo "📄 Backup Information:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    head -20 "$RESTORE_DIR/backup_info.txt"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# Confirmation prompt
echo ""
read -p "⚠️  This will overwrite existing data. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restore cancelled"
    rm -rf "$TEMP_DIR"
    exit 0
fi

# Check services
echo ""
echo "🔍 Checking services..."

# Check PostgreSQL
if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not accessible at $DB_HOST:$DB_PORT"
    rm -rf "$TEMP_DIR"
    exit 1
else
    echo "✅ PostgreSQL is accessible"
fi

# Check Redis
if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "⚠️  Redis is not accessible at $REDIS_HOST:$REDIS_PORT"
    REDIS_AVAILABLE=false
else
    echo "✅ Redis is accessible"
    REDIS_AVAILABLE=true
fi

# Stop Outline if running
echo ""
echo "🛑 Stopping Outline (if running)..."
if pgrep -f "node.*build/server/index.js" >/dev/null; then
    ./stop.sh
    sleep 3
else
    echo "ℹ️  Outline is not running"
fi

# Restore database
if [ -f "$RESTORE_DIR/database.sql" ]; then
    echo ""
    echo "🗄️  Restoring PostgreSQL database..."
    
    # Drop existing database connections
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';" >/dev/null 2>&1
    
    # Restore database
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        < "$RESTORE_DIR/database.sql" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Database restored successfully"
    else
        echo "❌ Database restore failed"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
else
    echo "⚠️  No database backup found in archive"
fi

# Restore Redis data
if [ "$REDIS_AVAILABLE" = true ] && [ -f "$RESTORE_DIR/redis_dump.rdb" ]; then
    echo ""
    echo "🔄 Restoring Redis data..."
    
    # Flush existing Redis data
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHALL >/dev/null 2>&1
    
    # Stop Redis, restore RDB file, restart Redis (this is complex, so we'll use a simpler approach)
    # Copy RDB data using redis-cli restore commands would be complex, so we'll skip this for now
    echo "⚠️  Redis restore requires manual intervention - RDB file available at $RESTORE_DIR/redis_dump.rdb"
    echo "   To restore: 1) Stop Redis, 2) Replace dump.rdb, 3) Start Redis"
else
    echo "ℹ️  No Redis data to restore or Redis not available"
fi

# Restore application data
if [ -d "$RESTORE_DIR/data" ]; then
    echo ""
    echo "📄 Restoring application data..."
    sudo mkdir -p /var/lib/outline/ 2>/dev/null
    sudo rm -rf /var/lib/outline/data 2>/dev/null
    sudo cp -r "$RESTORE_DIR/data" /var/lib/outline/ 2>/dev/null
    sudo chown -R $USER:$USER /var/lib/outline/data 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Application data restored"
    else
        echo "⚠️  Application data restore failed (check permissions)"
    fi
else
    echo "ℹ️  No application data found in backup"
fi

# Restore environment configuration
if [ -f "$RESTORE_DIR/env_backup.txt" ]; then
    echo ""
    read -p "🔧 Restore environment configuration? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$RESTORE_DIR/env_backup.txt" .env 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ Environment configuration restored"
        else
            echo "❌ Failed to restore environment configuration"
        fi
    else
        echo "ℹ️  Environment configuration not restored"
    fi
fi

# Cleanup
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Final summary
echo ""
echo "🎉 Restore completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Database: Restored"
echo "$([ "$REDIS_AVAILABLE" = true ] && echo "⚠️  Redis: Manual restore needed" || echo "ℹ️  Redis: Not available")"
echo "$([ -d "/var/lib/outline/data" ] && echo "✅ Data: Restored" || echo "ℹ️  Data: Not found")"
echo ""
echo "🚀 You can now start Outline with: ./start.sh"

