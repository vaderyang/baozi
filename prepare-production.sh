#!/bin/bash

# ============================================================================
# Outline Production Environment Setup Script
# ============================================================================
# This script creates a production .env file with secure defaults
# Usage: ./prepare-production.sh

set -e

ENVFILE=".env"
ENVEXAMPLE=".env.production.example"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Outline Production Environment Setup                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env already exists
if [ -f "$ENVFILE" ]; then
    echo -e "${YELLOW}⚠ Warning: $ENVFILE already exists!${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}✗ Aborted. Existing .env file preserved.${NC}"
        exit 1
    fi
    # Backup existing file
    BACKUP="${ENVFILE}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$ENVFILE" "$BACKUP"
    echo -e "${GREEN}✓ Backed up existing .env to $BACKUP${NC}"
    echo ""
fi

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}✗ Error: openssl is required but not installed.${NC}"
    echo "  Please install openssl and try again."
    exit 1
fi

# Generate secure random keys
echo -e "${BLUE}[1/4] Generating secure random keys...${NC}"
SECRET_KEY=$(openssl rand -hex 32)
UTILS_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Generated SECRET_KEY${NC}"
echo -e "${GREEN}✓ Generated UTILS_SECRET${NC}"
echo -e "${GREEN}✓ Generated POSTGRES_PASSWORD${NC}"
echo ""

# Prompt for URL
echo -e "${BLUE}[2/4] Configuration...${NC}"
read -p "Enter your public URL (e.g., https://outline.example.com) [http://localhost:6700]: " URL_INPUT
URL=${URL_INPUT:-http://localhost:6700}
echo -e "${GREEN}✓ URL set to: $URL${NC}"
echo ""

# Prompt for port
read -p "Enter port number [6700]: " PORT_INPUT
PORT=${PORT_INPUT:-6700}
echo -e "${GREEN}✓ Port set to: $PORT${NC}"
echo ""

# Prompt for authentication provider
echo -e "${BLUE}[3/4] Authentication Setup...${NC}"
echo "At least one authentication provider is required."
echo ""
echo "Select authentication provider:"
echo "  1) Google OAuth"
echo "  2) Slack OAuth"
echo "  3) Microsoft Azure/Entra"
echo "  4) OIDC (Generic)"
echo "  5) Skip for now (configure manually later)"
read -p "Choice [5]: " AUTH_CHOICE
AUTH_CHOICE=${AUTH_CHOICE:-5}

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
AZURE_CLIENT_ID=""
AZURE_CLIENT_SECRET=""
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""
OIDC_AUTH_URI=""
OIDC_TOKEN_URI=""
OIDC_USERINFO_URI=""
OIDC_LOGOUT_URI=""

case $AUTH_CHOICE in
    1)
        echo ""
        echo "Google OAuth Configuration:"
        read -p "  Google Client ID: " GOOGLE_CLIENT_ID
        read -p "  Google Client Secret: " GOOGLE_CLIENT_SECRET
        echo -e "${GREEN}✓ Google OAuth configured${NC}"
        ;;
    2)
        echo ""
        echo "Slack OAuth Configuration:"
        read -p "  Slack Client ID: " SLACK_CLIENT_ID
        read -p "  Slack Client Secret: " SLACK_CLIENT_SECRET
        echo -e "${GREEN}✓ Slack OAuth configured${NC}"
        ;;
    3)
        echo ""
        echo "Microsoft Azure/Entra Configuration:"
        read -p "  Azure Client ID: " AZURE_CLIENT_ID
        read -p "  Azure Client Secret: " AZURE_CLIENT_SECRET
        echo -e "${GREEN}✓ Azure OAuth configured${NC}"
        ;;
    4)
        echo ""
        echo "OIDC Configuration:"
        read -p "  OIDC Client ID: " OIDC_CLIENT_ID
        read -p "  OIDC Client Secret: " OIDC_CLIENT_SECRET
        read -p "  OIDC Auth URI: " OIDC_AUTH_URI
        read -p "  OIDC Token URI: " OIDC_TOKEN_URI
        read -p "  OIDC UserInfo URI: " OIDC_USERINFO_URI
        read -p "  OIDC Logout URI (optional): " OIDC_LOGOUT_URI
        echo -e "${GREEN}✓ OIDC configured${NC}"
        ;;
    5)
        echo -e "${YELLOW}⚠ Skipping authentication setup${NC}"
        echo -e "${YELLOW}  You must configure at least one auth provider in .env before deployment${NC}"
        ;;
esac
echo ""

# Create .env file
echo -e "${BLUE}[4/4] Creating .env file...${NC}"

cat > "$ENVFILE" << EOF
# ============================================================================
# Outline Production Environment Configuration
# ============================================================================
# Generated: $(date)
# IMPORTANT: Keep this file secure and never commit to version control!

# ===========================
# Application Settings
# ===========================
NODE_ENV=production
URL=$URL
PORT=$PORT

# CDN URL for static assets (optional)
CDN_URL=

# For separate collaboration server (optional, advanced usage)
COLLABORATION_URL=

# Number of processes (divide available memory by 512MB as rough estimate)
WEB_CONCURRENCY=2

# Default language
DEFAULT_LANGUAGE=en_US

# ===========================
# Security (AUTO-GENERATED)
# ===========================
SECRET_KEY=$SECRET_KEY
UTILS_SECRET=$UTILS_SECRET

# ===========================
# Database (PostgreSQL)
# ===========================
POSTGRES_USER=outline
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=outline

# Full database URL (auto-configured for docker-compose)
DATABASE_URL=postgres://outline:$POSTGRES_PASSWORD@postgres:5432/outline

# Connection pool settings (optional)
DATABASE_CONNECTION_POOL_MIN=
DATABASE_CONNECTION_POOL_MAX=

# Disable SSL for local/docker database
PGSSLMODE=disable

# ===========================
# Redis
# ===========================
REDIS_URL=redis://redis:6379

# ===========================
# File Storage
# ===========================
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=./data
FILE_STORAGE_UPLOAD_MAX_SIZE=262144000

# For S3 storage (uncomment and configure if needed)
# FILE_STORAGE=s3
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=us-east-1
# AWS_S3_UPLOAD_BUCKET_URL=
# AWS_S3_UPLOAD_BUCKET_NAME=
# AWS_S3_FORCE_PATH_STYLE=false
# AWS_S3_ACL=private

# ===========================
# SSL/HTTPS
# ===========================
# Completely disable HTTPS
FORCE_HTTPS=false
ENABLE_SSL=false

# Base64 encoded SSL certificate (leave empty to disable SSL)
SSL_KEY=
SSL_CERT=

# ===========================
# Authentication
# ===========================
EOF

# Add authentication credentials if provided
if [ ! -z "$GOOGLE_CLIENT_ID" ]; then
cat >> "$ENVFILE" << EOF

# Google OAuth
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
EOF
fi

if [ ! -z "$SLACK_CLIENT_ID" ]; then
cat >> "$ENVFILE" << EOF

# Slack OAuth
SLACK_CLIENT_ID=$SLACK_CLIENT_ID
SLACK_CLIENT_SECRET=$SLACK_CLIENT_SECRET
EOF
fi

if [ ! -z "$AZURE_CLIENT_ID" ]; then
cat >> "$ENVFILE" << EOF

# Microsoft Azure/Entra OAuth
AZURE_CLIENT_ID=$AZURE_CLIENT_ID
AZURE_CLIENT_SECRET=$AZURE_CLIENT_SECRET
AZURE_RESOURCE_APP_ID=
EOF
fi

if [ ! -z "$OIDC_CLIENT_ID" ]; then
    # If OIDC_LOGOUT_URI is provided and doesn't contain post_logout_redirect_uri, append it
    if [ ! -z "$OIDC_LOGOUT_URI" ] && [[ ! "$OIDC_LOGOUT_URI" =~ post_logout_redirect_uri ]]; then
        OIDC_LOGOUT_URI="${OIDC_LOGOUT_URI}?post_logout_redirect_uri=${URL}"
    fi
cat >> "$ENVFILE" << EOF

# OIDC Configuration
OIDC_CLIENT_ID=$OIDC_CLIENT_ID
OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET
OIDC_AUTH_URI=$OIDC_AUTH_URI
OIDC_TOKEN_URI=$OIDC_TOKEN_URI
OIDC_USERINFO_URI=$OIDC_USERINFO_URI
OIDC_LOGOUT_URI=$OIDC_LOGOUT_URI
OIDC_USERNAME_CLAIM=preferred_username
OIDC_DISPLAY_NAME=OpenID Connect
OIDC_SCOPES=openid profile email
EOF
fi

# Add remaining optional configuration
cat >> "$ENVFILE" << EOF

# Additional auth providers (configure as needed)
# See .env.production.example for all options

# ===========================
# Email (SMTP) - Optional
# ===========================
SMTP_SERVICE=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=

# ===========================
# Rate Limiting
# ===========================
RATE_LIMITER_ENABLED=true
RATE_LIMITER_REQUESTS=1000
RATE_LIMITER_DURATION_WINDOW=60

# ===========================
# Integrations - Optional
# ===========================
# GitHub integration
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Linear integration
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=

# Notion import
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Sentry error tracking
SENTRY_DSN=
SENTRY_TUNNEL=

# ===========================
# Debugging & Monitoring
# ===========================
ENABLE_UPDATES=true
DEBUG=http
LOG_LEVEL=info
EOF

chmod 600 "$ENVFILE"
echo -e "${GREEN}✓ Created $ENVFILE with secure permissions (600)${NC}"
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup Complete!                                           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo -e "  • URL: $URL"
echo -e "  • Port: $PORT"
echo -e "  • Database: PostgreSQL (docker-compose)"
echo -e "  • Cache: Redis (docker-compose)"
echo -e "  • File Storage: Local filesystem"
echo -e "  • HTTPS: Disabled (use reverse proxy for SSL)"
echo ""

if [ "$AUTH_CHOICE" == "5" ]; then
    echo -e "${YELLOW}⚠ IMPORTANT: No authentication provider configured!${NC}"
    echo -e "${YELLOW}  Edit .env and add at least one of:${NC}"
    echo -e "${YELLOW}    - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET${NC}"
    echo -e "${YELLOW}    - SLACK_CLIENT_ID + SLACK_CLIENT_SECRET${NC}"
    echo -e "${YELLOW}    - AZURE_CLIENT_ID + AZURE_CLIENT_SECRET${NC}"
    echo -e "${YELLOW}    - OIDC credentials${NC}"
    echo ""
fi

echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Review and edit .env if needed"
if [ "$AUTH_CHOICE" == "5" ]; then
    echo -e "  2. ${YELLOW}Configure at least one authentication provider${NC}"
fi
echo -e "  $([ "$AUTH_CHOICE" == "5" ] && echo "3" || echo "2"). Run: ${GREEN}docker-compose up -d${NC}"
echo -e "  $([ "$AUTH_CHOICE" == "5" ] && echo "4" || echo "3"). Access Outline at: ${GREEN}$URL${NC}"
echo ""
echo -e "${BLUE}Security Notes:${NC}"
echo -e "  • .env file permissions set to 600 (owner read/write only)"
echo -e "  • Never commit .env to version control"
echo -e "  • Backup this file securely"
echo -e "  • Generated secrets are cryptographically random"
echo ""
echo -e "${GREEN}Happy documenting! 📝${NC}"
echo ""
