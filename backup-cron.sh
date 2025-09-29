#!/bin/bash

# Automated Outline Wiki Backup Script for Cron
# This script creates backups and manages backup retention

# Configuration
BACKUP_DIR="/home/vader/backups/outline"
RETENTION_DAYS=30  # Keep backups for 30 days
MAX_BACKUPS=10     # Keep maximum 10 backups

# Logging
LOG_FILE="/home/vader/backups/outline/backup.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to log errors
log_error() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1" | tee -a "$LOG_FILE" >&2
}

log "Starting automated backup"

# Change to the application directory
cd /home/vader/baozi || {
    log_error "Failed to change to application directory"
    exit 1
}

# Run the backup script
if ./backup.sh >> "$LOG_FILE" 2>&1; then
    log "Backup completed successfully"
else
    log_error "Backup failed"
    exit 1
fi

# Cleanup old backups based on retention policy
log "Cleaning up old backups (older than $RETENTION_DAYS days)..."

# Remove backups older than retention period
find "$BACKUP_DIR" -name "outline_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -exec rm -f {} \; 2>/dev/null

# Keep only the latest MAX_BACKUPS backups
cd "$BACKUP_DIR" || exit 1
ls -t outline_backup_*.tar.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

REMAINING_BACKUPS=$(ls -1 outline_backup_*.tar.gz 2>/dev/null | wc -l)
log "Cleanup completed. $REMAINING_BACKUPS backups remaining"

# Calculate total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Total backup directory size: $TOTAL_SIZE"

log "Automated backup process completed"

