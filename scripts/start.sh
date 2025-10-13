#!/bin/bash

# ==========================================
# Outline Service Starter Script
# ==========================================
# This script provides an easy way to start Outline services
# - Checks if infrastructure is ready
# - Verifies Docker containers are running
# - Offers different startup modes (development, production-like)
# - Shows helpful information and logs
# ==========================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Banner
echo "==========================================="
echo "  Outline Service Starter"
echo "==========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    error ".env file not found!"
    error "Please run ./scripts/init.sh first"
    exit 1
fi

# Parse command line arguments
MODE="${1:-dev}"
SHOW_HELP=false

case "$MODE" in
    --help|-h|help)
        SHOW_HELP=true
        ;;
    dev|development)
        MODE="dev"
        ;;
    prod|production)
        MODE="prod"
        ;;
    watch)
        MODE="watch"
        ;;
    *)
        error "Unknown mode: $MODE"
        SHOW_HELP=true
        ;;
esac

if [ "$SHOW_HELP" = true ]; then
    echo "Usage: ./scripts/start.sh [mode]"
    echo ""
    echo "Modes:"
    echo "  dev, development  - Start in development mode (default)"
    echo "  watch            - Start with auto-reload on file changes"
    echo "  prod, production - Start in production-like mode"
    echo "  help             - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/start.sh              # Start in dev mode"
    echo "  ./scripts/start.sh dev          # Start in dev mode"
    echo "  ./scripts/start.sh watch        # Start with auto-reload"
    echo "  ./scripts/start.sh prod         # Start in production mode"
    exit 0
fi

# Check Docker containers
info "Checking Docker containers..."

if ! docker ps --format '{{.Names}}' | grep -q "outline-postgres"; then
    error "PostgreSQL container is not running"
    error "Please run ./scripts/init.sh first"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "outline-redis"; then
    error "Redis container is not running"
    error "Please run ./scripts/init.sh first"
    exit 1
fi

# Check if containers are healthy
if ! docker exec outline-postgres pg_isready -U outline &> /dev/null; then
    error "PostgreSQL is not ready"
    error "Try restarting: docker-compose restart postgres"
    exit 1
fi

if ! docker exec outline-redis redis-cli ping &> /dev/null; then
    error "Redis is not ready"
    error "Try restarting: docker-compose restart redis"
    exit 1
fi

success "Docker containers are running and healthy"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    warn "node_modules not found"
    info "Installing dependencies..."
    yarn install
fi

# Check if build directory exists
if [ ! -d "build" ]; then
    warn "Build directory not found"
    info "Building application..."
    yarn build:server
fi

# Get configuration from .env
URL=$(grep "^URL=" .env | cut -d '=' -f2)
PORT=$(grep "^PORT=" .env | cut -d '=' -f2)

# Display startup information
echo "==========================================="
echo "  Starting Outline in ${CYAN}${MODE}${NC} mode"
echo "==========================================="
echo ""
echo "Configuration:"
echo "  URL:  ${BLUE}${URL}${NC}"
echo "  Port: ${BLUE}${PORT}${NC}"
echo ""

# Check if authentication is configured
AUTH_CONFIGURED=false

if grep -q "^GOOGLE_CLIENT_ID=.\\+" .env 2>/dev/null; then
    AUTH_CONFIGURED=true
    echo "  Auth: ${GREEN}Google OAuth configured${NC}"
elif grep -q "^SLACK_CLIENT_ID=.\\+" .env 2>/dev/null; then
    AUTH_CONFIGURED=true
    echo "  Auth: ${GREEN}Slack OAuth configured${NC}"
elif grep -q "^AZURE_CLIENT_ID=.\\+" .env 2>/dev/null; then
    AUTH_CONFIGURED=true
    echo "  Auth: ${GREEN}Azure AD configured${NC}"
elif grep -q "^DISCORD_CLIENT_ID=.\\+" .env 2>/dev/null; then
    AUTH_CONFIGURED=true
    echo "  Auth: ${GREEN}Discord OAuth configured${NC}"
elif grep -q "^OIDC_CLIENT_ID=.\\+" .env 2>/dev/null; then
    AUTH_CONFIGURED=true
    echo "  Auth: ${GREEN}OIDC configured${NC}"
else
    warn "No authentication provider configured!"
    echo "  ${YELLOW}You need to configure at least one auth provider to sign in${NC}"
    echo "  ${YELLOW}See docs/AZURE_AD_AUTH_SETUP.md for Azure AD setup${NC}"
    echo ""
fi

echo ""
echo "==========================================="
echo ""

# Function to show useful commands
show_commands() {
    echo ""
    echo "Useful commands:"
    echo "  ${CYAN}Ctrl+C${NC}             - Stop the server"
    echo "  ${CYAN}docker-compose logs${NC} - View infrastructure logs"
    echo "  ${CYAN}docker-compose ps${NC}   - Check container status"
    echo ""
}

# Function to handle cleanup on exit
cleanup() {
    echo ""
    info "Shutting down..."
    echo ""
    info "Docker containers are still running"
    echo "  To stop them: ${CYAN}docker-compose stop${NC}"
    echo "  To remove them: ${CYAN}docker-compose down${NC}"
    exit 0
}

# Register cleanup function
trap cleanup SIGINT SIGTERM

# Start the application based on mode
case "$MODE" in
    dev)
        info "Starting development server..."
        info "Services: web, worker, websockets, collaboration, cron, admin"
        echo ""

        if [ "$AUTH_CONFIGURED" = false ]; then
            warn "Authentication not configured - you won't be able to sign in!"
            echo ""
        fi

        show_commands

        # Start in development mode
        yarn dev
        ;;

    watch)
        info "Starting development server with auto-reload..."
        info "File changes will automatically restart the server"
        echo ""

        if [ "$AUTH_CONFIGURED" = false ]; then
            warn "Authentication not configured - you won't be able to sign in!"
            echo ""
        fi

        show_commands

        # Start with watch mode (auto-reload)
        yarn dev:watch
        ;;

    prod)
        info "Starting in production-like mode..."
        echo ""

        # Ensure build is up to date
        info "Building application..."
        yarn build

        if [ "$AUTH_CONFIGURED" = false ]; then
            error "Authentication MUST be configured for production mode!"
            exit 1
        fi

        show_commands

        # Start in production mode
        NODE_ENV=production yarn start
        ;;
esac

# This line should not be reached due to trap, but just in case
cleanup
