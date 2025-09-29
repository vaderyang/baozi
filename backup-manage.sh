#!/bin/bash

# Outline Wiki Backup Management Script
# This script helps manage backups

BACKUP_DIR="/home/vader/backups/outline"

show_help() {
    echo "🗂️  Outline Wiki Backup Management"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list, ls          - List all available backups"
    echo "  create, backup    - Create a new backup"
    echo "  restore <file>    - Restore from backup"
    echo "  info <file>       - Show backup information"
    echo "  delete <file>     - Delete a backup"
    echo "  cleanup           - Remove old backups"
    echo "  size              - Show backup directory size"
    echo "  schedule          - Setup automated backups"
    echo "  logs              - Show backup logs"
    echo "  help, -h, --help  - Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 create"
    echo "  $0 restore outline_backup_20231229_143022.tar.gz"
    echo "  $0 info outline_backup_20231229_143022.tar.gz"
}

list_backups() {
    echo "📋 Available Backups:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "❌ Backup directory does not exist: $BACKUP_DIR"
        return 1
    fi
    
    cd "$BACKUP_DIR" || return 1
    
    if ! ls outline_backup_*.tar.gz >/dev/null 2>&1; then
        echo "ℹ️  No backups found"
        return 0
    fi
    
    echo "$(printf "%-35s %-10s %-20s" "Backup Name" "Size" "Date")"
    echo "$(printf "%-35s %-10s %-20s" "───────────────────────────────────" "──────────" "────────────────────")"
    
    for backup in $(ls -t outline_backup_*.tar.gz 2>/dev/null); do
        size=$(du -sh "$backup" | cut -f1)
        date=$(stat -c %y "$backup" | cut -d' ' -f1-2 | cut -d'.' -f1)
        printf "%-35s %-10s %-20s\n" "$backup" "$size" "$date"
    done
}

show_info() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "❌ Please specify a backup file"
        return 1
    fi
    
    if [ ! -f "$BACKUP_DIR/$backup_file" ]; then
        echo "❌ Backup file not found: $backup_file"
        return 1
    fi
    
    echo "📄 Backup Information: $backup_file"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Extract and show backup info
    temp_dir="/tmp/backup_info_$$"
    mkdir -p "$temp_dir"
    tar -xzf "$BACKUP_DIR/$backup_file" -C "$temp_dir" --wildcards "*/backup_info.txt" 2>/dev/null
    
    info_file=$(find "$temp_dir" -name "backup_info.txt" | head -1)
    if [ -f "$info_file" ]; then
        cat "$info_file"
    else
        echo "⚠️  No backup information available"
        echo "File size: $(du -sh "$BACKUP_DIR/$backup_file" | cut -f1)"
        echo "Date: $(stat -c %y "$BACKUP_DIR/$backup_file" | cut -d'.' -f1)"
    fi
    
    rm -rf "$temp_dir"
}

cleanup_backups() {
    echo "🧹 Cleaning up old backups..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local retention_days=30
    local max_backups=10
    
    echo "Policy: Keep backups for $retention_days days, maximum $max_backups backups"
    
    cd "$BACKUP_DIR" || return 1
    
    # Count current backups
    local current_count=$(ls -1 outline_backup_*.tar.gz 2>/dev/null | wc -l)
    echo "Current backups: $current_count"
    
    # Remove old backups
    local removed_old=$(find . -name "outline_backup_*.tar.gz" -mtime +$retention_days | wc -l)
    find . -name "outline_backup_*.tar.gz" -mtime +$retention_days -delete 2>/dev/null
    
    # Keep only latest backups
    local excess=$((current_count - removed_old - max_backups))
    if [ $excess -gt 0 ]; then
        ls -t outline_backup_*.tar.gz 2>/dev/null | tail -n +$((max_backups + 1)) | xargs -r rm -f
    fi
    
    local final_count=$(ls -1 outline_backup_*.tar.gz 2>/dev/null | wc -l)
    local removed_total=$((current_count - final_count))
    
    echo "Removed: $removed_total backups"
    echo "Remaining: $final_count backups"
}

show_size() {
    echo "💾 Backup Storage Usage:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "❌ Backup directory does not exist"
        return 1
    fi
    
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    local backup_count=$(ls -1 "$BACKUP_DIR"/outline_backup_*.tar.gz 2>/dev/null | wc -l)
    
    echo "Directory: $BACKUP_DIR"
    echo "Total size: $total_size"
    echo "Backup count: $backup_count"
    
    if [ $backup_count -gt 0 ]; then
        echo ""
        echo "Individual backup sizes:"
        cd "$BACKUP_DIR" || return 1
        du -sh outline_backup_*.tar.gz 2>/dev/null | sort -k2
    fi
}

setup_schedule() {
    echo "⏰ Setting up automated backups..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check if cron entry exists
    if crontab -l 2>/dev/null | grep -q "backup-cron.sh"; then
        echo "✅ Automated backup is already scheduled"
        echo ""
        echo "Current cron schedule:"
        crontab -l 2>/dev/null | grep "backup-cron.sh"
        return 0
    fi
    
    echo "This will setup daily backups at 2:00 AM"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        return 0
    fi
    
    # Add cron entry
    (crontab -l 2>/dev/null; echo "0 2 * * * /home/vader/baozi/backup-cron.sh") | crontab -
    
    if [ $? -eq 0 ]; then
        echo "✅ Automated backup scheduled successfully"
        echo "   Daily backups at 2:00 AM"
        echo "   Logs: /home/vader/backups/outline/backup.log"
    else
        echo "❌ Failed to setup automated backup"
        return 1
    fi
}

show_logs() {
    local log_file="/home/vader/backups/outline/backup.log"
    
    echo "📝 Backup Logs:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -f "$log_file" ]; then
        echo "ℹ️  No logs found at $log_file"
        return 0
    fi
    
    echo "Log file: $log_file"
    echo ""
    tail -20 "$log_file"
    echo ""
    echo "For full logs: tail -f $log_file"
}

# Main script logic
case "$1" in
    "list"|"ls")
        list_backups
        ;;
    "create"|"backup")
        ./backup.sh
        ;;
    "restore")
        ./restore.sh "$2"
        ;;
    "info")
        show_info "$2"
        ;;
    "delete"|"remove")
        if [ -z "$2" ]; then
            echo "❌ Please specify a backup file to delete"
            exit 1
        fi
        if [ -f "$BACKUP_DIR/$2" ]; then
            rm -f "$BACKUP_DIR/$2"
            echo "✅ Backup deleted: $2"
        else
            echo "❌ Backup file not found: $2"
            exit 1
        fi
        ;;
    "cleanup")
        cleanup_backups
        ;;
    "size")
        show_size
        ;;
    "schedule")
        setup_schedule
        ;;
    "logs")
        show_logs
        ;;
    "help"|"-h"|"--help"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

