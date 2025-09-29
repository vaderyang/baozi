# Outline Wiki Operation Guide

This guide explains how to operate the Outline Wiki application using the provided scripts.

## Quick Start Scripts

### 🚀 Start the Application
```bash
./start.sh
```
- Checks prerequisites (PostgreSQL, Redis, build directory)
- Starts Outline in production mode on http://172.16.11.67:3000
- Shows real-time logs (Press Ctrl+C to stop)

### 🛑 Stop the Application
```bash
./stop.sh
```
- Attempts graceful shutdown first (SIGTERM)
- Force kills processes if needed (SIGKILL)
- Confirms all processes are stopped

### 🔄 Restart the Application
```bash
./restart.sh
```
- Stops and then starts the application
- Useful when configuration changes are made

### 📊 Check Status
```bash
./status.sh
```
- Shows if Outline is running
- Checks dependencies (PostgreSQL, Redis)
- Displays useful information and commands

## Prerequisites

Before starting Outline, ensure:

1. **PostgreSQL** is running on 127.0.0.1:5432
2. **Redis** is running on 127.0.0.1:6379
3. **Build directory** exists (run `yarn build` if missing)

## Configuration

The application is configured to:
- Listen on all interfaces (0.0.0.0:3000)
- Accessible via http://172.16.11.67:3000
- Use local PostgreSQL and Redis instances
- Run in production mode
- Disable HTTPS forcing

## Manual Commands

If you prefer manual control:

### Build the application:
```bash
yarn build
```

### Start manually:
```bash
NODE_ENV=production yarn start
```

### Check processes:
```bash
pgrep -f "node.*build/server/index.js"
```

### Kill processes manually:
```bash
pkill -f "node.*build/server/index.js"
```

## Troubleshooting

### Common Issues:

1. **Port 3000 already in use:**
   ```bash
   sudo netstat -tlnp | grep :3000
   sudo kill -9 <PID>
   ```

2. **PostgreSQL not accessible:**
   ```bash
   sudo systemctl status postgresql
   sudo systemctl start postgresql
   ```

3. **Redis not accessible:**
   ```bash
   sudo systemctl status redis
   sudo systemctl start redis
   ```

4. **Build directory missing:**
   ```bash
   yarn build
   ```

### Logs and Debugging:

- Scripts show real-time output
- For background operation, consider using PM2:
  ```bash
  npm install -g pm2
  pm2 start "NODE_ENV=production yarn start" --name outline
  pm2 logs outline
  ```

## File Structure

- `start.sh` - Start the application
- `stop.sh` - Stop the application  
- `restart.sh` - Restart the application
- `status.sh` - Check application status
- `OPERATION_GUIDE.md` - This guide

## Support

If you encounter issues:
1. Check the status with `./status.sh`
2. Verify prerequisites are running
3. Check for port conflicts
4. Review application logs for errors


## Backup and Restore

The application includes comprehensive backup and restore functionality.

### 📦 Backup Scripts

#### Create Manual Backup
```bash
./backup.sh
```
- Backs up PostgreSQL database
- Backs up Redis data (if available)
- Backs up application files from `/var/lib/outline/data`
- Backs up environment configuration
- Creates compressed archive with timestamp

#### Backup Management
```bash
./backup-manage.sh [command]
```

Available commands:
- `list` - Show all available backups
- `create` - Create a new backup
- `restore <file>` - Restore from backup
- `info <file>` - Show backup information
- `delete <file>` - Delete a backup
- `cleanup` - Remove old backups
- `size` - Show storage usage
- `schedule` - Setup automated backups
- `logs` - Show backup logs

#### Examples:
```bash
# List all backups
./backup-manage.sh list

# Create a backup
./backup-manage.sh create

# Show backup info
./backup-manage.sh info outline_backup_20231229_143022.tar.gz

# Restore from backup
./backup-manage.sh restore outline_backup_20231229_143022.tar.gz

# Setup daily automated backups
./backup-manage.sh schedule
```

### 🔄 Restore Process

1. **Stop Outline** (automatic during restore)
2. **Extract backup** to temporary location
3. **Restore database** using PostgreSQL
4. **Restore application data** to `/var/lib/outline/data`
5. **Optionally restore** environment configuration
6. **Start Outline** manually after restore

### ⏰ Automated Backups

Setup automated daily backups:
```bash
./backup-manage.sh schedule
```

This creates a cron job that:
- Runs daily at 2:00 AM
- Creates backups automatically
- Manages retention (keeps 30 days, max 10 backups)
- Logs all activities

### 📂 Backup Contents

Each backup includes:
- **database.sql** - Complete PostgreSQL dump
- **redis_dump.rdb** - Redis data (if available)
- **data/** - Application uploaded files and data
- **env_backup.txt** - Environment configuration
- **backup_info.txt** - Backup metadata and restore instructions

### 💾 Storage Location

- **Backup Directory**: `/home/vader/backups/outline/`
- **Log File**: `/home/vader/backups/outline/backup.log`
- **Archive Format**: `outline_backup_YYYYMMDD_HHMMSS.tar.gz`

### 🚨 Important Notes

- Always test restore procedures in a non-production environment first
- Backups include sensitive configuration data - store securely
- Redis restore may require manual intervention
- Ensure sufficient disk space for backups
- Regular backup testing is recommended

