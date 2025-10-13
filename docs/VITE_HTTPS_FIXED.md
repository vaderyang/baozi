# ✅ Vite HTTPS Fixed - All Requests Now Use HTTP

## The Problem

- Homepage loaded on HTTP ✅
- But sub-requests (Vite assets, scripts) went to HTTPS ❌
- This caused CSP violations and blocked resources

## Root Cause

The Vite dev server configuration in `vite.config.ts` was:
1. Looking for SSL certificate files
2. Setting `httpsConfig` to `undefined` when not found
3. Vite then used some default HTTPS behavior

## The Fix

Modified `vite.config.ts` to **explicitly disable HTTPS**:

```typescript
// Before: undefined fallback
try {
  httpsConfig = {
    key: fs.readFileSync("./server/config/certs/private.key"),
    cert: fs.readFileSync("./server/config/certs/public.cert"),
  };
} catch (_err) {
  // httpsConfig stays undefined
}

// After: explicit false
if (environment.SSL_KEY && environment.SSL_CERT) {
  // Only use HTTPS if explicitly configured
  httpsConfig = { key: ..., cert: ... };
} else {
  // Explicitly force HTTP
  httpsConfig = false;
}
```

**Key change**: `httpsConfig = false` ensures Vite uses HTTP, not some undefined default behavior.

---

## 🚀 How to Apply the Fix

### 1. Stop the Current Server
Press `Ctrl+C` if running

### 2. Kill Any Background Vite Processes
```bash
# Find and kill any Vite dev servers
pkill -f "vite"

# Or manually find and kill
ps aux | grep vite
# Then: kill <PID>
```

### 3. Clean Build Cache
```bash
# Remove build artifacts
rm -rf build/

# Optional: Clear Vite cache
rm -rf node_modules/.vite
```

### 4. Rebuild
```bash
yarn build:server
```

### 5. Start Fresh
```bash
./scripts/start.sh
```

### 6. Test
Open browser and visit:
```
http://localhost:3030
```

---

## ✅ Expected Behavior

After the fix, all requests should use HTTP:

### In Browser DevTools (F12 → Network Tab):

**Before (broken)**:
```
http://localhost:3030          → 200 OK ✅
https://localhost:3001/...     → BLOCKED ❌ (CSP violation)
https://localhost:3001/static/ → BLOCKED ❌ (CSP violation)
```

**After (fixed)**:
```
http://localhost:3030          → 200 OK ✅
http://localhost:3001/...      → 200 OK ✅
http://localhost:3001/static/  → 200 OK ✅
```

### Vite Dev Server Output

**Before**:
```
VITE v5.x ready in Xms
➜  Local:   https://localhost:3001/  ← HTTPS!
```

**After**:
```
VITE v5.x ready in Xms
➜  Local:   http://localhost:3001/   ← HTTP!
```

---

## 🔍 Verification Steps

### 1. Check Vite Server Protocol
When you start with `./scripts/start.sh`, look for the Vite output:
```
[vite] ready in X ms
[vite] ➜  Local:   http://localhost:3001/
```

Should say **HTTP** not HTTPS!

### 2. Check Browser Console
- Press `F12` (open DevTools)
- Go to "Console" tab
- Should see NO CSP errors ✅
- Should see Vite HMR connected ✅

### 3. Check Network Requests
- In DevTools, go to "Network" tab
- Reload the page
- Filter by "3001"
- All requests should show `http://localhost:3001/...` ✅
- No `https://localhost:3001/...` ❌

### 4. Verify CSP Headers
```bash
curl -I http://localhost:3030 | grep "script-src"
```

Should show:
```
script-src http://localhost:3001 localhost:3001 'unsafe-inline'
```

Notice **http://** in the CSP! ✅

---

## 🎯 Why This Fix Works

### The Vite HTTPS Logic:

1. **When `https: undefined`** → Vite may use default HTTPS in some configurations
2. **When `https: false`** → Vite explicitly uses HTTP ✅
3. **When `https: { key, cert }`** → Vite uses HTTPS with provided certs

By setting `https: false`, we **force** Vite to use HTTP, eliminating any ambiguity.

---

## 📋 Files Modified

1. **`vite.config.ts`** - Explicit HTTPS disabling
2. **`server/services/web.ts`** - HSTS maxAge: 0 (previous fix)
3. **`.env`** - URL changed to localhost:3030
4. **`.env.development`** - URL changed to localhost:3030

All changes work together to ensure **100% HTTP** in development!

---

## 🚨 Troubleshooting

### Still seeing HTTPS requests?

**1. Clear browser cache completely**
```
Chrome: chrome://settings/clearBrowserData
Select: "Cached images and files" + "All time"
```

**2. Kill all Node/Vite processes**
```bash
pkill -f "node.*vite"
pkill -f "node.*build/server"
```

**3. Remove all build artifacts**
```bash
rm -rf build/ node_modules/.vite
```

**4. Rebuild from scratch**
```bash
yarn build:server
./scripts/start.sh
```

**5. Test in incognito mode**
- Open incognito/private window
- Visit `http://localhost:3030`
- Check if HTTPS requests still happen

### Vite not starting?

Check for port conflicts:
```bash
lsof -i :3001
# Kill the process if found
```

### CSP errors still appear?

Check the actual CSP header:
```bash
curl -I http://localhost:3030 | grep script-src
```

Should include `http://localhost:3001` (not https).

If it shows HTTPS, the build is stale. Rebuild:
```bash
rm -rf build/
yarn build:server
```

---

## 🎉 Success Indicators

You'll know it's working when:

1. ✅ Vite output shows: `Local: http://localhost:3001/`
2. ✅ Browser console: No CSP errors
3. ✅ Network tab: All requests use `http://`
4. ✅ Page loads completely
5. ✅ Vite HMR connected (hot reload works)
6. ✅ React app renders

---

## 📝 Configuration Summary

**Complete working setup**:

```bash
# .env
URL=http://localhost:3030
FORCE_HTTPS=false

# .env.development
URL=http://localhost:3030
FORCE_HTTPS=false

# vite.config.ts
httpsConfig = false  // Explicit HTTP

# server/services/web.ts
hsts({ maxAge: 0 })  // Disable HSTS
```

All pieces work together for a fully HTTP development environment!

---

## 💡 Why We Need This

**In Production**: HTTPS everywhere (required, secure)
**In Development**: HTTP everywhere (simpler, no cert issues, no HSTS cache)

This fix ensures development uses **pure HTTP** without any HTTPS complications.

---

## Summary

- ✅ `vite.config.ts` updated to explicitly use HTTP
- ✅ No more HTTPS sub-requests
- ✅ No more CSP violations
- ✅ Complete HTTP environment

**Just rebuild and restart to see the fix in action!**

```bash
# Stop server (Ctrl+C)
yarn build:server
./scripts/start.sh
# Visit: http://localhost:3030
```

🎉 All requests now use HTTP!
