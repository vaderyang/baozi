# Outline Quick Start Guide

Get up and running with Outline in under 5 minutes!

## Prerequisites

- Docker & Docker Compose
- Node.js 20 or 22
- Yarn

## Fast Setup (No OAuth Required!)

```bash
# 1. Initialize infrastructure
./scripts/init.sh

# 2. Start the application
./scripts/start.sh

# 3. Sign in at http://localhost:3030
#    - Enter any email address
#    - Copy the magic link from console
#    - Paste in browser
#    - You're in! 🎉
```

That's it! In development mode, you don't need OAuth providers or SMTP servers.

## What Just Happened?

### init.sh did:
✅ Validated prerequisites (Docker, Node, Yarn)
✅ Added `local.outline.dev` to `/etc/hosts`
✅ Started PostgreSQL and Redis containers
✅ Installed dependencies
✅ Built the application
✅ Ran database migrations

### start.sh did:
✅ Verified infrastructure is healthy
✅ Started Outline with all services
✅ Enabled console logging for magic links

## Email Magic Links (No SMTP Needed!)

In development mode (`NODE_ENV=development`):
- Email authentication is **automatically enabled**
- Magic links are **logged to console** instead of sent via email
- No OAuth configuration required
- No SMTP server needed

### Sign-In Flow

1. **Go to** `http://local.outline.dev:3030`
2. **Enter email** (any email address works)
3. **Check console** for output like:
   ```
   [DEBUG] Magic link: http://local.outline.dev:3030/auth/email.callback?token=abc123...
   ```
4. **Copy & paste** the link into your browser
5. **Done!** You're signed in

## Configuration Files

### .env (Already configured!)
```bash
NODE_ENV=development
URL=http://localhost:3030
PORT=3030
SECRET_KEY=<generated>
UTILS_SECRET=<generated>
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379
SMTP_FROM_EMAIL=outline@local.outline.dev  # ✨ Enables email auth
DEBUG=*                                      # ✨ Shows magic links
LOG_LEVEL=debug
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=./data          # ✨ Local file storage
```

### docker-compose.yml
- PostgreSQL 15 on `localhost:5432`
- Redis 7 on `localhost:6379`
- Persistent volumes for data
- Health checks enabled

## Script Commands

### Development
```bash
./scripts/start.sh          # Start in dev mode
./scripts/start.sh watch    # Auto-reload on changes
./scripts/start.sh prod     # Production-like mode
```

### Infrastructure
```bash
docker-compose ps           # Check status
docker-compose logs -f      # View logs
docker-compose stop         # Stop containers
docker-compose start        # Start containers
docker-compose down -v      # Remove everything
```

## Next Steps

### For Development
✅ You're ready to go! Start coding.

### For Production
Read these guides:
- [Azure AD Setup](docs/AZURE_AD_AUTH_SETUP.md) - Configure OAuth
- [Email Auth Details](docs/DEV_EMAIL_AUTH_SETUP.md) - Understanding magic links
- [Scripts README](scripts/README.md) - Advanced usage

## Troubleshooting

### "No sign-in options available"
```bash
# Enable guest sign-in in database
docker exec -it outline-postgres psql -U outline -d outline
UPDATE teams SET "guestSignin" = true;
```

### Can't see magic links in console
```bash
# Ensure DEBUG is set
grep DEBUG .env  # Should show: DEBUG=*

# Restart with logs
./scripts/start.sh | grep -i "magic\|email"
```

### Containers won't start
```bash
# Check Docker is running
docker info

# View logs
docker-compose logs

# Reset everything
docker-compose down -v
./scripts/init.sh
```

### Port already in use
```bash
# Check what's using the port
lsof -i :3030

# Kill the process or change PORT in .env
```

### File storage permission error
```bash
# Error: EACCES: permission denied, mkdir '/var/lib/outline/data'
# Solution: Use local directory instead (already fixed in .env)
FILE_STORAGE_LOCAL_ROOT_DIR=./data

# Create the directory
mkdir -p data
```

### Database authentication failed
```bash
# Error: password authentication failed for user "user"
# Cause: .env.development overrides .env settings

# Solution: Update .env.development to match docker-compose.yml
DATABASE_URL=postgres://outline:outline@127.0.0.1:5432/outline

# Verify connection
docker exec outline-postgres psql -U outline -d outline -c "SELECT 1;"
```

### CSP errors (Content Security Policy)
```bash
# Error: Refused to load script 'https://local.outline.dev:3001/...'
# Cause: Browser trying to use HTTPS due to HSTS or cache

# Solution 1: Clear browser HSTS
# Chrome: chrome://net-internals/#hsts → Delete domain: local.outline.dev
# Firefox: Delete SiteSecurityServiceState.txt from profile folder

# Solution 2: Clear browser cache completely

# Solution 3: Use incognito/private mode

# Solution 4: Always access via HTTP (not HTTPS)
# ✅ http://local.outline.dev:3030
# ❌ https://local.outline.dev:3030

# See docs/CSP_TROUBLESHOOTING.md for detailed guide
```

## File Structure

```
baozi/
├── .env                          # ✨ Your config (already set up!)
├── docker-compose.yml            # ✨ PostgreSQL + Redis
├── scripts/
│   ├── init.sh                   # ✨ Infrastructure setup
│   ├── start.sh                  # ✨ Start services
│   └── README.md                 # Script documentation
├── docs/
│   ├── AZURE_AD_AUTH_SETUP.md   # Azure AD OAuth guide
│   ├── DEV_EMAIL_AUTH_SETUP.md  # Email magic link guide
│   └── ...
└── QUICK_START.md                # ← You are here!
```

## Common Workflows

### Daily Development
```bash
# Start (if containers are stopped)
docker-compose start

# Start Outline with auto-reload
./scripts/start.sh watch

# Code, test, repeat!
```

### Testing as Different Users
```bash
# Just enter different emails when signing in
# Each gets its own magic link in console
```

### Reset Database
```bash
docker-compose down -v
./scripts/init.sh
```

## Why Email Magic Links?

**vs OAuth for Development**:

| Feature | Magic Links | OAuth |
|---------|-------------|-------|
| Setup time | < 1 min | 15-30 min |
| External deps | None | OAuth provider |
| Works offline | ✅ Yes | ❌ No |
| Test multiple users | ✅ Easy | 🟡 Need accounts |
| Console-based | ✅ Yes | ❌ Browser flow |

**Perfect for**:
- Local development ✅
- Rapid iteration ✅
- Testing ✅
- Quick demos ✅

## Production Considerations

When deploying to production, you'll need:
1. **Real SMTP** for email delivery
2. **OAuth providers** (Azure AD, Google, etc.)
3. **HTTPS** with valid SSL certificate
4. **Production database** (not local Docker)
5. **Redis** for production (not local Docker)

See [Azure AD Setup Guide](docs/AZURE_AD_AUTH_SETUP.md) for production authentication.

## Support

- **Documentation**: `docs/` directory
- **Scripts Help**: `./scripts/start.sh --help`
- **Issues**: Check console logs and Docker logs
- **Outline Docs**: https://docs.getoutline.com

## Summary

**You now have**:
✅ Outline running locally
✅ Email magic link authentication (no OAuth!)
✅ PostgreSQL + Redis via Docker
✅ Hot-reload development environment
✅ Comprehensive setup scripts

**Start developing**:
```bash
./scripts/start.sh watch
# Visit http://local.outline.dev:3030
# Enter any email → Copy magic link from console → Sign in!
```

Happy coding! 🚀
