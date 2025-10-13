# Clear Browser HSTS Cache - Critical Step!

## ⚠️ The Fix is Applied, But Your Browser Cached the Old HSTS Setting

The server is now correctly sending `Strict-Transport-Security: max-age=0` (verified ✅).

However, **your browser cached the previous HSTS setting** that said "always use HTTPS for 180 days". You MUST clear this cache.

---

## 🔥 Nuclear Option: Easiest & Most Reliable

### Just Use Incognito/Private Mode

This is the **fastest way** to test without cache issues:

**Chrome/Edge**: `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (Mac)
**Firefox**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
**Safari**: `Cmd+Shift+N`

Then visit: **`http://local.outline.dev:3030`**

**This should work immediately!** ✅

---

## 🧹 Permanent Fix: Clear HSTS Cache

If you want to use your normal browser (not incognito), you MUST clear HSTS:

### Chrome / Edge / Brave

1. **Open**: `chrome://net-internals/#hsts`
   - Edge: `edge://net-internals/#hsts`
   - Brave: `brave://net-internals/#hsts`

2. **Scroll down** to "Delete domain security policies"

3. **Enter domain**: `local.outline.dev`

4. **Click**: "Delete"

5. **Verify**: Scroll up to "Query HSTS/PKP domain"
   - Enter: `local.outline.dev`
   - Click "Query"
   - Should say: "Not found" ✅

6. **Close ALL browser windows** (important!)

7. **Restart browser**

8. **Visit**: `http://local.outline.dev:3030`

---

### Firefox

1. **Type in address bar**: `about:support`

2. **Click**: "Open Folder" (next to "Profile Folder")

3. **Close Firefox completely** (all windows)

4. **In the folder that opened**, find and **delete**:
   - `SiteSecurityServiceState.txt`

5. **Restart Firefox**

6. **Visit**: `http://local.outline.dev:3030`

---

### Safari

1. **Safari → Preferences**

2. **Go to**: "Privacy" tab

3. **Click**: "Manage Website Data..."

4. **Search for**: `local.outline.dev`

5. **Remove** it

6. **Also clear cache**: Safari → Develop → Empty Caches
   - If you don't see "Develop" menu: Safari → Preferences → Advanced → Check "Show Develop menu"

7. **Quit Safari** (Cmd+Q)

8. **Restart Safari**

9. **Visit**: `http://local.outline.dev:3030`

---

## 🔍 How to Verify It's Fixed

### Test 1: Use curl (always works)
```bash
curl http://local.outline.dev:3030
```
Should return HTML, not a redirect. ✅

### Test 2: Check HSTS header
```bash
curl -I http://local.outline.dev:3030 | grep "Strict-Transport"
```
Should show: `Strict-Transport-Security: max-age=0` ✅

### Test 3: Browser DevTools
1. Open: `http://local.outline.dev:3030`
2. Press `F12` (open DevTools)
3. Go to "Network" tab
4. Refresh page
5. Click on first request (document)
6. Look at "Response Headers"
7. Should see: `strict-transport-security: max-age=0` ✅

### Test 4: Check for redirects
In DevTools Network tab:
- ❌ Should NOT see 301/307/308 redirect from http → https
- ✅ Should see direct 200 response for http://local.outline.dev:3030

---

## 🚨 Still Not Working?

### Option 1: Use Different Domain

Add to `/etc/hosts`:
```bash
echo "127.0.0.1 outline.local" | sudo tee -a /etc/hosts
```

Update `.env` and `.env.development`:
```bash
URL=http://outline.local:3030
```

Restart server:
```bash
./scripts/start.sh
```

Visit: `http://outline.local:3030`

---

### Option 2: Use localhost

Update `.env`:
```bash
sed -i '' 's|local.outline.dev|localhost|g' .env
```

Update `.env.development`:
```bash
sed -i '' 's|local.outline.dev|localhost|g' .env.development
```

Restart:
```bash
./scripts/start.sh
```

Visit: `http://localhost:3030`

---

### Option 3: Different Browser

Try a browser you haven't used for this project:
- If using Chrome → Try Firefox
- If using Firefox → Try Safari
- Or download a fresh browser profile

---

## 📊 Why This Happens

### Timeline:
1. **Before fix**: Server sent `max-age=15552000` (180 days)
2. **Your browser**: Cached "always use HTTPS for local.outline.dev"
3. **After fix**: Server now sends `max-age=0` (don't cache)
4. **Your browser**: Still using cached HSTS from step 2 ⚠️

### The Problem:
- HSTS cache is stored **per domain** in your browser
- It persists **even after clearing cookies/cache**
- It requires **special deletion** (the steps above)
- Or **incognito mode** bypasses it entirely

### The Solution:
Clear HSTS cache using steps above, OR use incognito mode!

---

## ✅ Checklist

- [ ] Server shows `Strict-Transport-Security: max-age=0` (check with curl) ✅ **DONE**
- [ ] Cleared browser HSTS for `local.outline.dev`
- [ ] Closed ALL browser windows
- [ ] Restarted browser
- [ ] Tried incognito mode
- [ ] Visiting `http://local.outline.dev:3030` (not https)
- [ ] DevTools shows no HTTPS redirect
- [ ] Page loads successfully

---

## 🎯 Recommended: Just Use Incognito

Honestly, the **fastest solution**:

1. **Open incognito/private mode**
2. **Visit**: `http://local.outline.dev:3030`
3. **Done!**

No cache clearing needed, works immediately! 🚀

---

## 💬 Common Questions

**Q: Why does curl work but browser doesn't?**
A: curl doesn't cache HSTS. Browsers do.

**Q: I cleared my cache, why still redirects?**
A: Regular cache ≠ HSTS cache. You must clear HSTS specifically.

**Q: Can I just wait for HSTS to expire?**
A: The old setting was 180 days. Too long to wait!

**Q: Will this happen again?**
A: No! The server now sends `max-age=0`, so browsers won't cache HSTS anymore.

---

## Summary

1. ✅ **Server is fixed** - Sending `max-age=0`
2. ⚠️ **Browser still has old HSTS cache** - Must clear it
3. 🚀 **Fastest solution** - Use incognito mode
4. 🔧 **Permanent solution** - Clear HSTS cache (see instructions above)

**Just use incognito mode and it will work immediately!** 🎉
