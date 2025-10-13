# ✅ URL Changed to localhost:3030

To avoid HSTS cache issues with `local.outline.dev`, the application URL has been changed to `localhost:3030`.

## What Changed

### Environment Files Updated

**`.env`**:
```bash
URL=http://localhost:3030        # Changed from local.outline.dev:3030
SMTP_FROM_EMAIL=outline@localhost # Changed from outline@local.outline.dev
```

**`.env.development`**:
```bash
URL=http://localhost:3030        # Changed from local.outline.dev:3030
SMTP_FROM_EMAIL=outline@localhost # Changed from outline@local.outline.dev
```

### Scripts Updated

- `scripts/init.sh` - Removed local.outline.dev /etc/hosts setup
- `scripts/start.sh` - Updated to show localhost:3030
- `QUICK_START.md` - Updated all references

---

## 🚀 How to Use

### 1. Rebuild the Server
```bash
./scripts/rebuild.sh
# Or manually:
yarn build:server
```

### 2. Stop Current Server
Press `Ctrl+C` if the server is running

### 3. Start the Server
```bash
./scripts/start.sh
```

### 4. Access Outline
Open your browser and visit:
```
http://localhost:3030
```

**No HSTS issues!** Localhost doesn't cache HTTPS redirects. ✅

---

## ✅ Benefits of localhost

1. **No HSTS cache issues** - Browsers don't cache HSTS for localhost
2. **No /etc/hosts needed** - Works immediately without sudo
3. **Standard setup** - Familiar to all developers
4. **No domain conflicts** - localhost always works
5. **Easier troubleshooting** - Standard debugging tools work better

---

## 📋 Complete Configuration

### Your Current .env
```bash
NODE_ENV=development
URL=http://localhost:3030
PORT=3030
SECRET_KEY=<your-generated-key>
UTILS_SECRET=<your-generated-key>
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379
SMTP_FROM_EMAIL=outline@localhost
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=./data
DEBUG=*
LOG_LEVEL=debug
FORCE_HTTPS=false
```

---

## 🎯 Quick Start

```bash
# 1. Make sure Docker containers are running
docker-compose ps

# 2. If not running, start them
docker-compose start

# 3. Rebuild server (only needed once)
yarn build:server

# 4. Start Outline
./scripts/start.sh

# 5. Open browser
# Visit: http://localhost:3030

# 6. Sign in with email
# - Enter any email address
# - Check console for magic link
# - Copy and paste the link
# - You're in! 🎉
```

---

## 🔧 Troubleshooting

### Port 3030 already in use
```bash
# Find what's using port 3030
lsof -i :3030

# Kill the process or change PORT in .env
```

### Can't connect to localhost:3030
```bash
# Check if server is running
ps aux | grep "node.*build/server"

# Check server logs
./scripts/start.sh | grep -i error
```

### Database connection errors
```bash
# Make sure PostgreSQL is running
docker ps | grep postgres

# Test connection
docker exec outline-postgres psql -U outline -d outline -c "SELECT 1;"
```

---

## 📝 Still Want to Use Custom Domain?

If you prefer a custom domain (for testing domain-specific features), you can:

### Option 1: Use a Different Domain
```bash
# Add to /etc/hosts
echo "127.0.0.1 outline.local" | sudo tee -a /etc/hosts

# Update .env
URL=http://outline.local:3030

# Rebuild and restart
yarn build:server
./scripts/start.sh
```

### Option 2: Return to local.outline.dev
```bash
# Update .env
URL=http://local.outline.dev:3030

# Add to /etc/hosts (if not already)
echo "127.0.0.1 local.outline.dev" | sudo tee -a /etc/hosts

# Clear browser HSTS first!
# Chrome: chrome://net-internals/#hsts
# Delete: local.outline.dev

# Rebuild and restart
yarn build:server
./scripts/start.sh
```

But honestly, **localhost:3030 just works** without any hassle! 🚀

---

## Summary

- ✅ URL changed to `http://localhost:3030`
- ✅ No HSTS cache issues
- ✅ No /etc/hosts modification needed
- ✅ Works immediately
- ✅ All documentation updated

**Just rebuild and restart to use the new URL!**

```bash
yarn build:server
./scripts/start.sh
```

Then visit: **http://localhost:3030** 🎉
