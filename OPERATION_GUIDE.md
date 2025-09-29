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

