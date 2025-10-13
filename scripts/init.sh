#!/bin/bash

# ==========================================
# Outline Infrastructure Initialization Script
# ==========================================
# This script sets up all required infrastructure for running Outline
# - Checks prerequisites (Docker, Node.js, Yarn)
# - Starts PostgreSQL and Redis containers
# - Waits for services to be healthy
# - Creates database and runs migrations
# - Verifies configuration
# ==========================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
echo "  Outline Infrastructure Setup"
echo "==========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    error ".env file not found!"
    error "Please create a .env file first (you can copy from .env.sample)"
    exit 1
fi

success ".env file found"

# Check prerequisites
info "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
    error "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
success "Docker is installed: $(docker --version)"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
success "Docker Compose is installed"

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    error "Docker daemon is not running. Please start Docker."
    exit 1
fi
success "Docker daemon is running"

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js 20 or 22."
    error "Visit: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
success "Node.js is installed: $NODE_VERSION"

# Check Yarn
if ! command -v yarn &> /dev/null; then
    error "Yarn is not installed. Please install Yarn."
    error "Run: npm install -g yarn"
    exit 1
fi
success "Yarn is installed: $(yarn --version)"

# Check openssl (for secret generation)
if ! command -v openssl &> /dev/null; then
    warn "OpenSSL is not installed. Secret key validation skipped."
else
    success "OpenSSL is installed"
fi

echo ""
info "All prerequisites satisfied!"
echo ""

# Using localhost - no custom domain setup needed
info "Using localhost:3030 for local development"
success "No /etc/hosts modification required"
echo ""

# Check if SECRET_KEY and UTILS_SECRET are set
info "Validating environment variables..."

if grep -q "generate_a_new_key" .env; then
    error "SECRET_KEY or UTILS_SECRET not properly set in .env"
    error "Please generate keys using: openssl rand -hex 32"
    exit 1
fi

success "Environment variables validated"
echo ""

# Check if containers are already running
info "Checking existing Docker containers..."

if docker ps -a --format '{{.Names}}' | grep -q "outline-postgres"; then
    warn "outline-postgres container already exists"
    read -p "Do you want to recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Stopping and removing existing containers..."
        docker-compose down -v
        success "Existing containers removed"
    fi
else
    info "No existing containers found"
fi

echo ""

# Start Docker services
info "Starting PostgreSQL and Redis containers..."
docker-compose up -d

if [ $? -ne 0 ]; then
    error "Failed to start Docker containers"
    exit 1
fi

success "Docker containers started"
echo ""

# Wait for services to be healthy
info "Waiting for services to be healthy..."

MAX_WAIT=60
WAIT_TIME=0

# Wait for PostgreSQL
info "Waiting for PostgreSQL..."
while ! docker exec outline-postgres pg_isready -U outline &> /dev/null; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        error "PostgreSQL failed to start within ${MAX_WAIT} seconds"
        docker-compose logs postgres
        exit 1
    fi
    echo -n "."
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
done
echo ""
success "PostgreSQL is ready"

# Wait for Redis
info "Waiting for Redis..."
WAIT_TIME=0
while ! docker exec outline-redis redis-cli ping &> /dev/null; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        error "Redis failed to start within ${MAX_WAIT} seconds"
        docker-compose logs redis
        exit 1
    fi
    echo -n "."
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
done
echo ""
success "Redis is ready"

echo ""

# Install dependencies
info "Checking Node.js dependencies..."

if [ ! -d "node_modules" ]; then
    info "Installing Node.js dependencies (this may take a few minutes)..."
    yarn install
    if [ $? -ne 0 ]; then
        error "Failed to install dependencies"
        exit 1
    fi
    success "Dependencies installed"
else
    success "Dependencies already installed"
    info "Run 'yarn install' manually if you need to update dependencies"
fi

echo ""

# Build the application
info "Building the application..."
yarn build:server

if [ $? -ne 0 ]; then
    error "Failed to build the application"
    exit 1
fi

success "Application built successfully"
echo ""

# Run database migrations
info "Running database migrations..."
yarn db:migrate

if [ $? -ne 0 ]; then
    error "Database migration failed"
    error "Check your DATABASE_URL in .env"
    exit 1
fi

success "Database migrations completed"
echo ""

# Show container status
info "Container status:"
docker-compose ps

echo ""
echo "==========================================="
success "Infrastructure setup completed!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "  1. Configure at least one authentication provider in .env"
echo "     (See docs/AZURE_AD_AUTH_SETUP.md for Azure AD setup)"
echo ""
echo "  2. Start the application:"
echo "     ${GREEN}./scripts/start.sh${NC}"
echo ""
echo "  3. Access Outline at:"
echo "     ${BLUE}http://localhost:3030${NC}"
echo ""
echo "Useful commands:"
echo "  - View logs:       docker-compose logs -f"
echo "  - Stop services:   docker-compose stop"
echo "  - Reset database:  docker-compose down -v"
echo ""
