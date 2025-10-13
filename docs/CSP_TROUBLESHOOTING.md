# Content Security Policy (CSP) Troubleshooting

This guide helps resolve Content Security Policy issues in development.

## Common Error

```
Refused to load the script 'https://local.outline.dev:3001/static/@vite/client'
because it violates the following Content Security Policy directive:
"script-src http://local.outline.dev:3001 localhost:3001 'unsafe-inline'"
```

## The Problem

The CSP is configured for `http://` but the browser is trying to load resources from `https://`. This typically happens due to:

1. **HSTS (HTTP Strict Transport Security)** - Server was sending HSTS headers (now fixed!)
2. **Browser HSTS cache** - Browser cached HSTS from previous visits
3. **HTTPS redirects** - Browser has cached a redirect from HTTP to HTTPS
4. **Mixed configuration** - Some config files use HTTPS while others use HTTP
5. **Browser extensions** - HTTPS Everywhere or similar extensions forcing HTTPS

## The Root Cause (FIXED)

The server was sending this header even in development:
```
Strict-Transport-Security: max-age=15552000; includeSubDomains
```

This header told browsers to ALWAYS use HTTPS for the domain (for 180 days!), which caused all the CSP issues.

**Fix applied**: Modified `server/services/web.ts` to explicitly set `maxAge: 0` for HSTS in development mode, which tells browsers NOT to enforce HTTPS.

## Quick Fix

### 1. Clear Browser Cache and HSTS

**Chrome/Edge:**
```
1. Open: chrome://net-internals/#hsts
2. Under "Delete domain security policies"
3. Enter: local.outline.dev
4. Click "Delete"
5. Clear cache: chrome://settings/clearBrowserData
   - Select "Cached images and files"
   - Select "All time"
   - Click "Clear data"
6. Close all browser windows
7. Reopen and try again
```

**Firefox:**
```
1. Close all Firefox windows
2. Delete these files from your Firefox profile:
   - SiteSecurityServiceState.txt
   - Find profile folder: about:support → "Profile Folder" → "Open Folder"
3. Restart Firefox
4. Clear cache: Preferences → Privacy & Security → Clear Data
```

**Safari:**
```
1. Safari → Preferences → Privacy
2. Click "Manage Website Data"
3. Search for "local.outline.dev"
4. Remove it
5. Clear cache: Develop → Empty Caches
```

### 2. Verify Environment Configuration

```bash
# Check .env
grep -E "URL=|FORCE_HTTPS=" .env

# Should show:
# URL=http://local.outline.dev:3030
# FORCE_HTTPS=false

# Check .env.development
grep -E "URL=|FORCE_HTTPS=" .env.development

# Should show:
# URL=http://local.outline.dev:3030
# FORCE_HTTPS=false
```

### 3. Restart Application

```bash
# Stop the application (Ctrl+C if running)

# Clear any cached builds
rm -rf build/

# Rebuild and restart
yarn build:server
./scripts/start.sh watch
```

### 4. Access with Correct Protocol

Always use **HTTP** (not HTTPS) in development:
```
✅ Correct:  http://local.outline.dev:3030
❌ Wrong:    https://local.outline.dev:3030
```

### 5. Try Incognito/Private Mode

Test in a fresh browser session:
- Chrome: `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (Mac)
- Firefox: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Safari: `Cmd+Shift+N`

## Understanding the Error

### What's Happening

1. **Backend (Port 3030)**: Serves the HTML page via HTTP
2. **Vite Dev Server (Port 3001)**: Serves the JavaScript/CSS assets via HTTP
3. **Browser**: Trying to load Vite assets via HTTPS (due to HSTS or caching)
4. **CSP**: Blocks the HTTPS requests because only HTTP is allowed

### CSP Configuration

In development, Outline's CSP allows:
```javascript
script-src:
  http://local.outline.dev:3001  // Vite dev server
  localhost:3001                  // Vite via localhost
  'unsafe-inline'                 // React dev tools
```

### Why HTTPS Fails

The CSP only allows HTTP, so when the browser tries HTTPS:
```
❌ https://local.outline.dev:3001/static/@vite/client
   Not in CSP allowlist → Blocked

✅ http://local.outline.dev:3001/static/@vite/client
   In CSP allowlist → Allowed
```

## Complete Checklist

- [ ] `.env` has `FORCE_HTTPS=false`
- [ ] `.env.development` has `FORCE_HTTPS=false`
- [ ] `.env` has `URL=http://local.outline.dev:3030` (not https)
- [ ] `.env.development` has `URL=http://local.outline.dev:3030` (not https)
- [ ] Cleared browser HSTS for `local.outline.dev`
- [ ] Cleared browser cache
- [ ] Application rebuilt (`yarn build:server`)
- [ ] Application restarted (`./scripts/start.sh`)
- [ ] Accessing via `http://` (not `https://`)
- [ ] Tested in incognito/private mode

## Advanced Solutions

### Option 1: Use localhost Instead

If HSTS issues persist, use localhost:

```bash
# Update .env
URL=http://localhost:3030

# Update .env.development
URL=http://localhost:3030

# Access via:
http://localhost:3030
```

**Pros:** No HSTS issues
**Cons:** Doesn't test custom domain behavior

### Option 2: Use a Different Domain

```bash
# Add to /etc/hosts
echo "127.0.0.1 outline.local" | sudo tee -a /etc/hosts

# Update .env
URL=http://outline.local:3030

# Update .env.development
URL=http://outline.local:3030

# Access via:
http://outline.local:3030
```

### Option 3: Allow HTTPS in CSP (Development Only)

If you need HTTPS for testing, modify CSP in development.

**Warning:** Only for testing HTTPS-specific features!

Add to `.env.development`:
```bash
# Allow both HTTP and HTTPS in development
DEVELOPMENT_ALLOW_MIXED_CSP=true
```

Then restart the application.

## Why Not Use HTTPS in Development?

1. **Certificate Issues**: Self-signed certificates cause browser warnings
2. **Complexity**: Requires SSL certificate setup and management
3. **Unnecessary**: Development doesn't need HTTPS security
4. **Vite Dev Server**: Runs on HTTP by default
5. **CSP Configuration**: Would need to allow both HTTP and HTTPS

**For production**, HTTPS is mandatory and properly configured.

## Environment File Reference

### Correct .env
```bash
NODE_ENV=development
URL=http://local.outline.dev:3030
PORT=3030
FORCE_HTTPS=false
# ... other settings
```

### Correct .env.development
```bash
URL=http://local.outline.dev:3030
DATABASE_URL=postgres://outline:outline@127.0.0.1:5432/outline
REDIS_URL=redis://127.0.0.1:6379
SMTP_FROM_EMAIL=outline@local.outline.dev
FORCE_HTTPS=false
DEVELOPMENT_UNSAFE_INLINE_CSP=true
LOG_LEVEL=debug
```

## Verifying the Fix

### 1. Check Server Output
```bash
./scripts/start.sh

# Should see:
# [INFO] Starting development server...
# Configuration:
#   URL:  http://local.outline.dev:3030  ← Should be HTTP!
```

### 2. Check Browser Console
Open browser console (F12), should NOT see:
- ❌ CSP violation errors
- ❌ Mixed content warnings
- ❌ Failed to load script errors

Should see:
- ✅ Vite client connected
- ✅ React app loaded
- ✅ No CSP errors

### 3. Check Network Tab
In browser DevTools → Network tab:
- All requests to `local.outline.dev:3001` should be HTTP (not HTTPS)
- Status should be `200 OK`
- No `ERR_BLOCKED_BY_CLIENT` errors

## Still Having Issues?

### Check for Browser Extensions

Disable these types of extensions:
- HTTPS Everywhere
- Privacy Badger
- uBlock Origin (advanced mode)
- Any extension that forces HTTPS

### Check System-Wide Proxy

```bash
# macOS
scutil --proxy

# Should not have HTTP/HTTPS proxy enabled
```

### Use Different Browser

Try a different browser that hasn't visited the site before:
- If using Chrome, try Firefox
- If using Firefox, try Safari
- Or use a clean browser profile

### Nuclear Option: Reset Everything

```bash
# 1. Stop application
# Ctrl+C

# 2. Clear browser completely
# Delete browser profile or use brand new browser

# 3. Remove all env overrides
rm -f .env.local .env.production

# 4. Verify configuration
cat .env
cat .env.development

# 5. Rebuild from scratch
docker-compose down -v
rm -rf build/ node_modules/.cache
./scripts/init.sh

# 6. Start fresh
./scripts/start.sh

# 7. Access via HTTP (not HTTPS!)
# Open: http://local.outline.dev:3030
```

## Summary

**Most common causes:**
1. 🏆 **HSTS** - Browser remembers HTTPS from previous visit
2. 🥈 **Cache** - Stale cached redirects or resources
3. 🥉 **Config** - HTTPS in env files instead of HTTP

**Quick fix:**
1. Clear HSTS: `chrome://net-internals/#hsts`
2. Clear cache: `chrome://settings/clearBrowserData`
3. Verify config: `FORCE_HTTPS=false` and `URL=http://...`
4. Restart app: `./scripts/start.sh`
5. Use HTTP: `http://local.outline.dev:3030`

**When fixed, you should see:**
- ✅ No CSP errors in console
- ✅ Vite HMR working
- ✅ React DevTools working
- ✅ Application loads normally
