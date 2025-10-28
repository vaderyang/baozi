# Outline Production Deployment Guide

This guide explains how to clone this repository and set up a production instance of Outline from scratch.

## Prerequisites

Before you begin, ensure you have the following installed on your server:

- **Docker** (version 20.10 or later)
- **Docker Compose** (version 2.0 or later)
- **Git**
- **OpenSSL** (for generating secure keys)

Verify installations:
```bash
docker --version
docker-compose --version
git --version
openssl version
```

## Quick Start (5 Minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/vaderyang/baozi.git
cd baozi
```

### 2. Checkout Production Branch

```bash
git checkout production-release-v1
```

### 3. Run the Setup Script

The interactive setup script will guide you through configuration:

```bash
./prepare-production.sh
```

**The script will prompt you for:**
- **Public URL** - Your domain (e.g., `https://outline.yourdomain.com`)
- **Port** - Default is `6700`
- **Authentication Provider** - Choose from:
  - OIDC (Generic OpenID Connect)
  - Google OAuth
  - Slack OAuth
  - Microsoft Azure/Entra
  - Or skip and configure manually later

**The script automatically:**
- ✅ Generates secure random keys (`SECRET_KEY`, `UTILS_SECRET`, `POSTGRES_PASSWORD`)
- ✅ Creates a production-ready `.env` file
- ✅ Backs up any existing `.env` file

### 4. Start the Services

```bash
docker-compose up -d
```

This starts three containers:
- **PostgreSQL 16** - Database
- **Redis 7** - Cache and sessions
- **Outline** - The application

### 5. Check Status

```bash
docker-compose ps
docker-compose logs -f outline
```

Wait for the message: `"Listening on http://localhost:6700"`

### 6. Access Outline

Open your browser and navigate to:
```
http://localhost:6700
```

Or your configured domain if you set up a reverse proxy.

## Authentication Setup

You **must** configure at least one authentication provider. Outline doesn't have a default admin account - users authenticate via OAuth/OIDC.

### Option 1: OIDC (Keycloak, Auth0, etc.)

During `prepare-production.sh`, select option `4) OIDC (Generic)` and provide:

```bash
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_AUTH_URI=https://your-idp.com/auth
OIDC_TOKEN_URI=https://your-idp.com/token
OIDC_USERINFO_URI=https://your-idp.com/userinfo
OIDC_LOGOUT_URI=https://your-idp.com/logout
```

**Important:** The script automatically appends `?post_logout_redirect_uri=YOUR_URL` to the logout URI so users return to Outline after logout.

### Option 2: Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Set authorized redirect URI: `https://your-domain.com/auth/google.callback`
4. During setup, select option `1) Google OAuth` and provide:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### Option 3: Other Providers

See [Outline Authentication Documentation](https://docs.getoutline.com/s/hosting/doc/authentication-7ViKRmRY5o) for Slack, Azure, and other providers.

## Email Configuration (Optional but Recommended)

To enable magic login links and email notifications, add SMTP settings to `.env`:

```bash
# Email (SMTP)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USERNAME=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

**For port 25 (unencrypted):**
```bash
SMTP_PORT=25
SMTP_SECURE=false
```

After updating `.env`, restart:
```bash
docker-compose restart outline
```

## Updating Configuration

If you need to update your configuration later:

1. Run the setup script again:
   ```bash
   ./prepare-production.sh
   ```

2. **New Feature:** The script detects your existing `.env` and shows current values as defaults. Just press **Enter** to keep existing values, or type new ones to change.

3. Restart the services:
   ```bash
   docker-compose restart outline
   ```

## Production Checklist

Before going live, ensure you have:

- [ ] **Reverse Proxy** - Use Nginx/Apache/Caddy with SSL (Let's Encrypt)
- [ ] **Domain Name** - Configure DNS to point to your server
- [ ] **Backups** - Set up automated backups of PostgreSQL and file storage
- [ ] **Firewall** - Only expose ports 80 and 443 (not 6700 directly)
- [ ] **SSL Certificate** - Use Let's Encrypt or your certificate authority
- [ ] **Authentication** - At least one OAuth/OIDC provider configured
- [ ] **Email (Optional)** - SMTP configured for magic links and notifications
- [ ] **Monitoring** - Set up health check monitoring

## Reverse Proxy Example (Nginx)

```nginx
server {
    listen 80;
    server_name outline.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name outline.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/outline.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/outline.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:6700;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Increase timeouts for large file uploads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

**Update `.env` after setting up reverse proxy:**
```bash
URL=https://outline.yourdomain.com
FORCE_HTTPS=true
```

## Common Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Outline only
docker-compose logs -f outline

# Last 100 lines
docker-compose logs --tail=100 outline
```

### Restart Services
```bash
# All services
docker-compose restart

# Outline only
docker-compose restart outline
```

### Stop Services
```bash
docker-compose down
```

### Rebuild After Code Changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Backup
```bash
# Create backup
docker-compose exec postgres pg_dump -U outline outline > outline-backup-$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U outline outline < outline-backup-20251022.sql
```

### Access Database Console
```bash
docker-compose exec postgres psql -U outline -d outline
```

## Troubleshooting

### Cannot Access Outline

1. Check if containers are running:
   ```bash
   docker-compose ps
   ```

2. Check Outline logs:
   ```bash
   docker-compose logs outline
   ```

3. Verify database connection:
   ```bash
   docker-compose exec outline wget -qO- http://localhost:6700/_health
   ```

### Authentication Not Working

1. Verify authentication provider credentials in `.env`
2. Check redirect URIs match your configuration
3. Check Outline logs for authentication errors:
   ```bash
   docker-compose logs outline | grep -i auth
   ```

### Database Connection Failed

1. Ensure PostgreSQL is healthy:
   ```bash
   docker-compose exec postgres pg_isready -U outline
   ```

2. Verify `DATABASE_URL` in `.env` matches postgres credentials

### Port Already in Use

If port 6700 is already in use, edit `.env`:
```bash
PORT=7700
```

And update `docker-compose.yml`:
```yaml
ports:
  - "${PORT:-7700}:7700"
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

## Data Locations

### Docker Volumes
All persistent data is stored in Docker volumes:
- `postgres-data` - Database
- `redis-data` - Cache
- `outline-data` - File uploads

### Backup Volumes
```bash
# List volumes
docker volume ls | grep baozi

# Backup volume
docker run --rm -v baozi_postgres-data:/data -v $(pwd):/backup ubuntu tar czf /backup/postgres-data-backup.tar.gz /data

# Restore volume
docker run --rm -v baozi_postgres-data:/data -v $(pwd):/backup ubuntu tar xzf /backup/postgres-data-backup.tar.gz -C /
```

## User Management

### Promote User to Admin

After first login, you can promote a user to admin:

```bash
# Access database
docker-compose exec postgres psql -U outline -d outline

# List users
SELECT id, name, email, role FROM users;

# Promote to admin
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

# Exit
\q
```

**User must log out and log back in for changes to take effect.**

### Available Roles
- `admin` - Full permissions
- `member` - Standard user
- `viewer` - Read-only access
- `guest` - Limited access

## Security Notes

⚠️ **Important Security Practices:**

1. **Never commit `.env` file** - Contains secrets
2. **Use strong passwords** - Auto-generated by script
3. **Enable HTTPS** - Use reverse proxy with SSL
4. **Keep secrets secure** - Back up `.env` safely
5. **Update regularly** - Pull latest security updates
6. **Firewall rules** - Limit exposure to only necessary ports
7. **Regular backups** - Automated daily backups recommended

## Getting Help

- **Outline Documentation**: https://docs.getoutline.com/
- **GitHub Issues**: https://github.com/vaderyang/baozi/issues
- **Community Forum**: https://community.getoutline.com/

## Version Information

- **Outline Base**: Latest from outline/outline
- **PostgreSQL**: 16-alpine
- **Redis**: 7-alpine
- **Node.js**: 22 (build), 22-slim (runtime)
- **Default Port**: 6700

---

🤖 This deployment is optimized for production use with Docker Compose.

For Kubernetes deployments, see the official Outline documentation.
