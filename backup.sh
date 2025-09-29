#!/bin/bash

# Outline Wiki Backup Script
# This script creates a complete backup of Outline data

# Configuration
BACKUP_DIR="/home/vader/backups/outline"
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_USER="user"
DB_NAME="outline"
DB_PASSWORD="pass"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="outline_backup_$DATE"

echo "💾 Starting Outline Wiki Backup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create backup directory
echo "📁 Creating backup directory..."
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Check if services are accessible
echo "🔍 Checking services..."

# Check PostgreSQL
if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not accessible at $DB_HOST:$DB_PORT"
    exit 1
else
    echo "✅ PostgreSQL is accessible"
fi

# Check Redis
if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "⚠️  Redis is not accessible at $REDIS_HOST:$REDIS_PORT (continuing anyway)"
    REDIS_AVAILABLE=false
else
    echo "✅ Redis is accessible"
    REDIS_AVAILABLE=true
fi

# Backup PostgreSQL database
echo ""
echo "🗄️  Backing up PostgreSQL database..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --verbose \
    --clean \
    --if-exists \
    --create \
    > "$BACKUP_DIR/$BACKUP_NAME/database.sql" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database backup completed"
    DB_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME/database.sql" | cut -f1)
    echo "   Size: $DB_SIZE"
else
    echo "❌ Database backup failed"
    exit 1
fi

# Backup Redis data (if available)
if [ "$REDIS_AVAILABLE" = true ]; then
    echo ""
    echo "🔄 Backing up Redis data..."
    
    # Save Redis data to backup
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$BACKUP_DIR/$BACKUP_NAME/redis_dump.rdb" >/dev/null 2>&1
    
    if [ $? -eq 0 ] && [ -f "$BACKUP_DIR/$BACKUP_NAME/redis_dump.rdb" ]; then
        echo "✅ Redis backup completed"
        REDIS_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME/redis_dump.rdb" | cut -f1)
        echo "   Size: $REDIS_SIZE"
    else
        echo "⚠️  Redis backup failed or no data to backup"
    fi
fi

# Backup uploaded files and data
echo ""
echo "📄 Backing up application files..."

# Backup data directory (if it exists)
if [ -d "/var/lib/outline/data" ]; then
    echo "   Copying data directory..."
    cp -r "/var/lib/outline/data" "$BACKUP_DIR/$BACKUP_NAME/data" 2>/dev/null
    if [ $? -eq 0 ]; then
        DATA_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME/data" | cut -f1)
        echo "✅ Data directory backup completed (Size: $DATA_SIZE)"
    else
        echo "⚠️  Data directory backup failed"
    fi
else
    echo "ℹ️  No data directory found at /var/lib/outline/data"
fi

# Backup environment configuration
echo ""
echo "⚙️  Backing up configuration..."
cp .env "$BACKUP_DIR/$BACKUP_NAME/env_backup.txt" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Environment configuration backed up"
else
    echo "⚠️  Environment configuration backup failed"
fi

# Create backup info file
echo ""
echo "📝 Creating backup information..."
cat > "$BACKUP_DIR/$BACKUP_NAME/backup_info.txt" << EOL
Outline Wiki Backup Information
==============================

Backup Date: $(date)
Backup Name: $BACKUP_NAME
Server: $(hostname)
User: $(whoami)

Database Information:
- Host: $DB_HOST:$DB_PORT
- Database: $DB_NAME
- User: $DB_USER

Redis Information:
- Host: $REDIS_HOST:$REDIS_PORT
- Available: $REDIS_AVAILABLE

Files Included:
- database.sql (PostgreSQL dump)
$([ "$REDIS_AVAILABLE" = true ] && echo "- redis_dump.rdb (Redis data)")
$([ -d "/var/lib/outline/data" ] && echo "- data/ (Application data)")
- env_backup.txt (Environment configuration)
- backup_info.txt (This file)

Restore Instructions:
1. Restore database: PGPASSWORD=pass psql -h 127.0.0.1 -p 5432 -U user < database.sql
2. Restore Redis: redis-cli -h 127.0.0.1 -p 6379 --rdb redis_dump.rdb
3. Restore data: sudo cp -r data /var/lib/outline/
4. Restore config: cp env_backup.txt .env

EOL

echo "✅ Backup information created"

# Create compressed archive
echo ""
echo "🗜️  Creating compressed archive..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME/" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Compressed archive created"
    ARCHIVE_SIZE=$(du -sh "$BACKUP_NAME.tar.gz" | cut -f1)
    echo "   Archive: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    echo "   Size: $ARCHIVE_SIZE"
    
    # Remove uncompressed backup directory
    rm -rf "$BACKUP_NAME/"
    echo "🧹 Temporary files cleaned up"
else
    echo "❌ Failed to create compressed archive"
    exit 1
fi

# Final summary
echo ""
echo "🎉 Backup completed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Backup file: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "📊 Total size: $ARCHIVE_SIZE"
echo ""
echo "🔧 Useful commands:"
echo "   List backups:    ls -la $BACKUP_DIR/"
echo "   Extract backup:  tar -xzf $BACKUP_DIR/$BACKUP_NAME.tar.gz -C /tmp/"
echo "   Restore script:  ./restore.sh $BACKUP_NAME.tar.gz"

