# Outline Docker Production Deployment

Quick reference for deploying Outline with Docker Compose.

## 🚀 Quick Start

### 1️⃣ Setup Environment

```bash
# Run the automated setup script
./prepare-production.sh
```

This will:
- ✓ Generate secure random keys
- ✓ Configure URL and port (default: 6700)
- ✓ Guide you through OAuth setup
- ✓ Create `.env` file with secure permissions

### 2️⃣ Start Services

```bash
# Build and start all services
docker-compose up -d
```

### 3️⃣ Access Outline

```bash
# Default: http://localhost:6700
# Or your configured URL
```

## 📋 What's Included

The Docker Compose stack includes:

- **Outline**: Node.js application (port 6700)
- **PostgreSQL 16**: Database with persistent storage
- **Redis 7**: Cache and session storage

All services include:
- Health checks
- Auto-restart policies
- Persistent volumes
- Isolated network

## ⚙️ Configuration

### Default Settings

| Setting | Value |
|---------|-------|
| Port | 6700 |
| Database | PostgreSQL 16 (docker) |
| Cache | Redis 7 (docker) |
| Storage | Local filesystem |
| HTTPS | Disabled (use reverse proxy) |

### Generated Secrets

The setup script automatically generates:
- `SECRET_KEY` - 64-char hex key
- `UTILS_SECRET` - 64-char hex key
- `POSTGRES_PASSWORD` - 64-char hex key

## 📚 Documentation

- **[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)** - Complete deployment guide
- **[.env.production.example](./.env.production.example)** - Environment variable reference

## 🔧 Common Commands

```bash
# View logs
docker-compose logs -f outline

# Restart application
docker-compose restart outline

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose build outline
docker-compose up -d outline

# Run database migrations
docker-compose exec outline yarn db:migrate

# Backup database
docker-compose exec postgres pg_dump -U outline outline > backup.sql
```

## 🔒 Security Notes

- SSL/HTTPS is **disabled by default** - use a reverse proxy (Nginx/Caddy)
- All secrets are auto-generated with `openssl rand -hex 32`
- `.env` file permissions set to 600 (owner only)
- Never commit `.env` to version control
- At least one OAuth provider required

## 🌐 Production Deployment

For production with SSL/TLS, use a reverse proxy:

**Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:6700;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy:**
```
your-domain.com {
    reverse_proxy localhost:6700
}
```

## 🆘 Troubleshooting

**Container won't start?**
```bash
docker-compose logs outline
```

**Database connection issues?**
```bash
docker-compose exec postgres pg_isready
```

**Reset everything (⚠️ destroys data):**
```bash
docker-compose down -v
docker-compose up -d
```

## 📖 More Information

See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for:
- Detailed configuration options
- OAuth provider setup guides
- Backup/restore procedures
- Scaling and performance tuning
- Complete troubleshooting guide
