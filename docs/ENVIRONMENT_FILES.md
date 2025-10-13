# Understanding Environment Files in Outline

Outline uses a cascading environment file system that can be confusing if you're not aware of how it works.

## Environment File Loading Order

From `server/utils/environment.ts`, the loading order is:

```
1. .env (base configuration)
2. .env.{NODE_ENV} (environment-specific overrides)
3. process.env (runtime environment variables)
```

**Important**: Later files **override** earlier ones!

## File Hierarchy

### 1. `.env` (Base Configuration)
- Your main configuration file
- Always loaded first
- Should contain all required variables

### 2. `.env.development` (Development Overrides)
- Loaded when `NODE_ENV=development`
- Overrides values from `.env`
- Used by `yarn dev` and `./scripts/start.sh`

### 3. `.env.production` (Production Overrides)
- Loaded when `NODE_ENV=production`
- Overrides values from `.env`
- Used in production deployments

### 4. `.env.local` (Local Overrides)
- Loaded when `NODE_ENV=development`
- Personal settings not committed to git
- Listed in `.gitignore`

### 5. `.env.test` (Test Overrides)
- Loaded when `NODE_ENV=test`
- Used during test runs

## Common Pitfall: Conflicting Values

### The Problem
You set `DATABASE_URL` in `.env`:
```bash
# .env
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
```

But `.env.development` has different credentials:
```bash
# .env.development
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/outline
```

**Result**: When running in development mode, the app uses `user:pass` (from `.env.development`) instead of `outline:outline` (from `.env`).

### The Solution

**Option A: Keep files in sync**
```bash
# Update .env.development to match .env
DATABASE_URL=postgres://outline:outline@127.0.0.1:5432/outline
```

**Option B: Delete .env.development**
```bash
# Remove the override file entirely
rm .env.development

# Now .env values are used directly
```

**Option C: Use .env.local for personal overrides**
```bash
# Create .env.local (gitignored)
DATABASE_URL=postgres://myuser:mypass@localhost:5432/outline
```

## Environment Loading Logic

```javascript
// Simplified from server/utils/environment.ts
const envDefault = loadFile('.env')
const envSpecific = loadFile(`.env.${NODE_ENV}`)  // e.g., .env.development

process.env = {
  ...envDefault,         // 1. Base .env
  ...envSpecific,        // 2. Override with .env.{NODE_ENV}
  ...process.env,        // 3. Override with runtime env vars
}
```

## Which File Should I Edit?

### For Local Development
**Edit `.env`** - Your main configuration file
- All your settings in one place
- Works for all environments unless overridden

### For Personal Settings
**Create `.env.local`** (gitignored)
- Personal database credentials
- Personal API keys
- Machine-specific paths

### For Team Development
**Edit `.env.development`**
- Shared development settings
- Committed to git
- Used by all developers

### For Production
**Edit `.env.production`** or use environment variables
- Production credentials
- Cloud service URLs
- Production feature flags

## Debugging Environment Variables

### Check what's actually loaded
```bash
# Add to your code temporarily
console.log('DATABASE_URL:', process.env.DATABASE_URL)
console.log('NODE_ENV:', process.env.NODE_ENV)

# Or use the dev script with debug output
DEBUG=* yarn dev | grep DATABASE
```

### Verify file loading
```bash
# Check which files exist
ls -la .env*

# Check file contents
cat .env
cat .env.development
cat .env.local  # if exists
```

### Test with specific NODE_ENV
```bash
# Force specific environment
NODE_ENV=development yarn dev    # Uses .env.development
NODE_ENV=production yarn start   # Uses .env.production
NODE_ENV=test yarn test          # Uses .env.test
```

## Current Project Setup

### Files in This Project

| File | Purpose | Committed to Git | Used When |
|------|---------|------------------|-----------|
| `.env` | Main config | ❌ No (.gitignore) | Always |
| `.env.sample` | Template/docs | ✅ Yes | Never (reference only) |
| `.env.development` | Dev overrides | ✅ Yes | `NODE_ENV=development` |
| `.env.test` | Test overrides | ✅ Yes | `NODE_ENV=test` |
| `.env.local` | Personal overrides | ❌ No (.gitignore) | When `NODE_ENV=development` |
| `.env.production` | Prod overrides | ❌ No (.gitignore) | `NODE_ENV=production` |

### What We've Configured

**`.env`** (Your main file):
```bash
NODE_ENV=development
URL=http://local.outline.dev:3030
PORT=3030
SECRET_KEY=<generated>
UTILS_SECRET=<generated>
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379
SMTP_FROM_EMAIL=outline@local.outline.dev
FILE_STORAGE_LOCAL_ROOT_DIR=./data
DEBUG=*
LOG_LEVEL=debug
```

**`.env.development`** (Updated to match):
```bash
URL=http://local.outline.dev:3030
DATABASE_URL=postgres://outline:outline@127.0.0.1:5432/outline
REDIS_URL=redis://127.0.0.1:6379
SMTP_FROM_EMAIL=outline@local.outline.dev
DEVELOPMENT_UNSAFE_INLINE_CSP=true
LOG_LEVEL=debug
```

## Best Practices

### ✅ Do
- Keep `.env` and `.env.development` in sync for shared settings
- Use `.env.local` for personal/machine-specific settings
- Document all variables in `.env.sample`
- Use runtime environment variables in production

### ❌ Don't
- Commit `.env` to git (contains secrets)
- Leave conflicting values between files
- Hardcode secrets in code
- Use different database schemas in different env files

## Troubleshooting

### "My changes to .env aren't working"
**Check**: Do you have a `.env.development` or `.env.local` overriding it?
```bash
grep DATABASE_URL .env*
```

### "Works locally but not in production"
**Check**: Different values in `.env.production` or missing production env vars
```bash
# Compare files
diff .env .env.production
```

### "Tests are using development database"
**Check**: `.env.test` should have separate test database
```bash
# .env.test should have:
DATABASE_URL=postgres://outline:outline@localhost:5432/outline_test
```

## Migration from Old Setup

If you're migrating from an older Outline setup:

```bash
# 1. Backup your old .env
cp .env .env.backup

# 2. Check what .env.development overrides
cat .env.development

# 3. Decide: sync them or delete .env.development
# Option A: Sync
vim .env.development  # Update to match .env

# Option B: Remove overrides
rm .env.development   # If you don't need different dev settings

# 4. Test
./scripts/start.sh
```

## Summary

**Key Points**:
1. `.env.{NODE_ENV}` **overrides** `.env`
2. When `NODE_ENV=development`, both `.env` and `.env.development` are loaded
3. Keep them in sync or remove `.env.development` if not needed
4. Use `.env.local` for personal settings (gitignored)
5. Always check both files when debugging connection issues

**Quick Fix for Database Issues**:
```bash
# Make sure these match in both files:
grep DATABASE_URL .env
grep DATABASE_URL .env.development

# Or remove the override:
rm .env.development
```
