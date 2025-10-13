# Outline Scripts

This directory contains utility scripts for setting up and running Outline.

## Available Scripts

### 🚀 init.sh - Infrastructure Setup

Sets up all required infrastructure for running Outline.

**What it does:**
- Checks prerequisites (Docker, Node.js, Yarn, OpenSSL)
- Adds `local.outline.dev` to `/etc/hosts` (requires sudo)
- Starts PostgreSQL and Redis containers via Docker Compose
- Waits for services to be healthy
- Installs Node.js dependencies
- Builds the application
- Runs database migrations

**Usage:**
```bash
./scripts/init.sh
```

**First-time setup:**
```bash
# 1. Make sure you have .env configured
cp .env.sample .env
# Edit .env and set your configuration

# 2. Run the initialization
./scripts/init.sh

# 3. Configure authentication (see docs/AZURE_AD_AUTH_SETUP.md)

# 4. Start the application
./scripts/start.sh
```

**Requirements:**
- Docker and Docker Compose installed
- Node.js 20 or 22 installed
- Yarn installed
- `.env` file configured with proper SECRET_KEY and UTILS_SECRET

---

### 🎯 start.sh - Service Starter

Provides an easy way to start Outline in different modes.

**What it does:**
- Verifies Docker containers are running and healthy
- Checks authentication configuration
- Starts Outline in the specified mode
- Shows helpful information and commands

**Usage:**
```bash
./scripts/start.sh [mode]
```

**Modes:**

| Mode | Description | Command |
|------|-------------|---------|
| `dev` (default) | Development mode with all services | `./scripts/start.sh` or `./scripts/start.sh dev` |
| `watch` | Auto-reload on file changes | `./scripts/start.sh watch` |
| `prod` | Production-like mode | `./scripts/start.sh prod` |

**Examples:**
```bash
# Start in development mode (default)
./scripts/start.sh

# Start with auto-reload (useful for development)
./scripts/start.sh watch

# Start in production-like mode
./scripts/start.sh prod

# Show help
./scripts/start.sh --help
```

**Development Mode:**
- Runs all services: web, worker, websockets, collaboration, cron, admin
- Includes debugging capabilities
- Hot-reloading for backend (in watch mode)

**Watch Mode:**
- Automatically restarts server on file changes
- Rebuilds backend on TypeScript file changes
- Frontend hot-reload via Vite
- Ideal for active development

**Production Mode:**
- Runs optimized build
- Requires authentication to be configured
- Suitable for testing production setup locally

---

## Quick Start

**First time setup:**
```bash
# 1. Initialize infrastructure
./scripts/init.sh

# 2. Configure Azure AD authentication (or another provider)
# See docs/AZURE_AD_AUTH_SETUP.md

# 3. Start the application
./scripts/start.sh
```

**Daily development workflow:**
```bash
# Make sure Docker containers are running
docker-compose ps

# If containers are stopped, start them
docker-compose start

# Start Outline in watch mode for development
./scripts/start.sh watch
```

---

## Useful Docker Commands

**Check container status:**
```bash
docker-compose ps
```

**View logs:**
```bash
# All containers
docker-compose logs -f

# Specific container
docker-compose logs -f postgres
docker-compose logs -f redis
```

**Manage containers:**
```bash
# Start containers
docker-compose start

# Stop containers (keeps data)
docker-compose stop

# Restart containers
docker-compose restart

# Stop and remove containers (keeps volumes/data)
docker-compose down

# Stop and remove containers AND volumes (deletes data)
docker-compose down -v
```

**Database management:**
```bash
# Access PostgreSQL
docker exec -it outline-postgres psql -U outline -d outline

# Access Redis CLI
docker exec -it outline-redis redis-cli
```

---

## Troubleshooting

### Script won't run
```bash
# Make scripts executable
chmod +x scripts/init.sh scripts/start.sh
```

### Docker containers not starting
```bash
# Check Docker is running
docker info

# View detailed logs
docker-compose logs

# Remove and recreate containers
docker-compose down -v
./scripts/init.sh
```

### Database migration fails
```bash
# Reset database
docker-compose down -v
./scripts/init.sh
```

### Port already in use
```bash
# Check what's using the port
lsof -i :3030  # or your configured PORT
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill the process or change PORT in .env
```

### local.outline.dev not resolving
```bash
# Verify /etc/hosts entry
cat /etc/hosts | grep local.outline.dev

# If missing, add it
echo "127.0.0.1 local.outline.dev" | sudo tee -a /etc/hosts

# Or use localhost instead
# Update URL in .env to http://localhost:3030
```

### Can't sign in - No authentication provider
You need to configure at least one authentication provider in `.env`. See:
- `docs/AZURE_AD_AUTH_SETUP.md` for Azure AD setup
- `.env.sample` for other provider options (Google, Slack, Discord, OIDC)

---

## Environment Configuration

Your `.env` file should have at minimum:

```bash
NODE_ENV=development
URL=http://local.outline.dev:3030
PORT=3030
SECRET_KEY=<generated-with-openssl-rand-hex-32>
UTILS_SECRET=<generated-with-openssl-rand-hex-32>
DATABASE_URL=postgres://outline:outline@localhost:5432/outline
REDIS_URL=redis://localhost:6379

# Plus at least ONE authentication provider:
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_RESOURCE_APP_ID=...
```

Generate secret keys:
```bash
openssl rand -hex 32
```

---

## File Structure

```
scripts/
├── README.md      # This file
├── init.sh        # Infrastructure setup script
└── start.sh       # Service starter script
```

---

## Additional Resources

- [Main README](../README.md)
- [Azure AD Setup Guide](../docs/AZURE_AD_AUTH_SETUP.md)
- [Outline Documentation](https://docs.getoutline.com)
- [Environment Variables Reference](../.env.sample)
