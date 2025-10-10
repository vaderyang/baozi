#!/bin/bash

# Outline Environment Initialization Script
# Usage: ./init.sh [dev|production]
# This script sets up all required environment and dependencies for Outline

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine environment
ENV="${1:-dev}"

if [[ "$ENV" != "dev" && "$ENV" != "production" ]]; then
    echo -e "${RED}❌ Invalid environment: $ENV${NC}"
    echo "Usage: ./init.sh [dev|production]"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}🚀 Outline Initialization Script${NC}"
echo -e "${BLUE}   Environment: ${YELLOW}$ENV${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print step
print_step() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check system requirements
print_step "Checking system requirements..."

# Check Node.js
if ! command_exists node; then
    print_error "Node.js is not installed!"
    echo "Please install Node.js 20 or 22 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$NODE_VERSION" -lt 20 ]]; then
    print_error "Node.js version must be 20 or higher. Current: $(node -v)"
    exit 1
fi
print_success "Node.js $(node -v) detected"

# Check Yarn
if ! command_exists yarn; then
    print_error "Yarn is not installed!"
    echo "Installing Yarn..."
    npm install -g yarn@1.22.22
fi
print_success "Yarn $(yarn -v) detected"

# Check Docker (for dev environment)
if [[ "$ENV" == "dev" ]]; then
    if ! command_exists docker; then
        print_error "Docker is not installed!"
        echo "Please install Docker from https://www.docker.com/get-started"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running!"
        echo "Please start Docker Desktop and try again"
        exit 1
    fi
    print_success "Docker detected and running"
fi

# Check PostgreSQL client (for production or if local postgres)
if [[ "$ENV" == "production" ]] || ! command_exists docker; then
    if ! command_exists psql; then
        print_warning "PostgreSQL client (psql) not found - database checks will be skipped"
    else
        print_success "PostgreSQL client detected"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Setup environment file
print_step "Setting up environment configuration..."

if [[ "$ENV" == "dev" ]]; then
    ENV_FILE=".env"
    ENV_TEMPLATE=".env.development"
    
    if [ -f "$ENV_FILE" ]; then
        print_warning "$ENV_FILE already exists"
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_success "Keeping existing $ENV_FILE"
        else
            cp "$ENV_TEMPLATE" "$ENV_FILE"
            print_success "Created $ENV_FILE from $ENV_TEMPLATE"
        fi
    else
        cp "$ENV_TEMPLATE" "$ENV_FILE"
        print_success "Created $ENV_FILE from $ENV_TEMPLATE"
    fi
    
    # Generate secrets for development if needed
    if grep -q "generate_a_new_key" "$ENV_FILE" 2>/dev/null || ! grep -q "SECRET_KEY=" "$ENV_FILE" 2>/dev/null; then
        print_warning "Generating SECRET_KEY and UTILS_SECRET..."
        if command_exists openssl; then
            SECRET_KEY=$(openssl rand -hex 32)
            UTILS_SECRET=$(openssl rand -hex 32)
            
            # Add secrets if not present
            if ! grep -q "^SECRET_KEY=" "$ENV_FILE"; then
                echo "" >> "$ENV_FILE"
                echo "SECRET_KEY=$SECRET_KEY" >> "$ENV_FILE"
            fi
            if ! grep -q "^UTILS_SECRET=" "$ENV_FILE"; then
                echo "UTILS_SECRET=$UTILS_SECRET" >> "$ENV_FILE"
            fi
            print_success "Generated secrets"
        else
            print_warning "OpenSSL not found - you'll need to generate secrets manually"
        fi
    fi
else
    # Production setup
    ENV_FILE=".env"
    
    if [ -f "$ENV_FILE" ]; then
        print_success "$ENV_FILE already exists"
    else
        print_warning "$ENV_FILE not found"
        echo "Creating from .env.sample..."
        cp .env.sample "$ENV_FILE"
        print_warning "IMPORTANT: You must edit $ENV_FILE with production values!"
        print_warning "Required: SECRET_KEY, UTILS_SECRET, DATABASE_URL, REDIS_URL, URL"
        print_warning "Required: At least one authentication provider (Google/Slack/etc.)"
    fi
fi

# Install dependencies
print_step "Installing Node.js dependencies..."
yarn install --frozen-lockfile
print_success "Dependencies installed"

# Setup Docker services for development
if [[ "$ENV" == "dev" ]]; then
    print_step "Starting Docker services (PostgreSQL & Redis)..."
    
    # Stop existing containers if any
    docker compose down 2>/dev/null || true
    
    # Start services
    docker compose up -d
    
    print_success "Docker services started"
    
    # Wait for PostgreSQL
    print_step "Waiting for PostgreSQL to be ready..."
    RETRIES=0
    MAX_RETRIES=30
    
    until docker compose exec -T postgres pg_isready -U user >/dev/null 2>&1; do
        RETRIES=$((RETRIES+1))
        if [ $RETRIES -ge $MAX_RETRIES ]; then
            print_error "PostgreSQL failed to start after $MAX_RETRIES attempts"
            exit 1
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    print_success "PostgreSQL is ready"
    
    # Wait for Redis
    print_step "Checking Redis..."
    sleep 2
    if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        print_success "Redis is ready"
    else
        print_warning "Redis check failed, but continuing..."
    fi
fi

# Create data directory for local file storage
print_step "Creating data directory..."
DATA_DIR="./data"
if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
    print_success "Created $DATA_DIR directory"
else
    print_success "$DATA_DIR directory already exists"
fi

# Setup database
if [[ "$ENV" == "dev" ]]; then
    print_step "Setting up database..."
    
    # Check if database exists
    DB_EXISTS=$(docker compose exec -T postgres psql -U user -lqt | cut -d \| -f 1 | grep -w outline | wc -l)
    
    if [ "$DB_EXISTS" -eq 0 ]; then
        print_warning "Database 'outline' does not exist, creating..."
        yarn db:create
        print_success "Database created"
    else
        print_success "Database 'outline' already exists"
    fi
    
    # Run migrations
    print_step "Running database migrations..."
    yarn db:migrate
    print_success "Database migrations completed"
else
    print_warning "Production mode: Skipping automatic database setup"
    echo "Please ensure your database is accessible and run: yarn db:migrate"
fi

# Install local SSL certificates for development
if [[ "$ENV" == "dev" ]]; then
    print_step "Installing local SSL certificates..."
    yarn install-local-ssl
    if [ -f "./server/config/certs/private.key" ] && [ -f "./server/config/certs/public.cert" ]; then
        print_success "SSL certificates installed"
    else
        print_warning "SSL certificates not generated (optional for HTTP)"
    fi
fi

# Build the application
print_step "Building application..."
yarn build
print_success "Application built successfully"

# Setup backup directory
if [[ "$ENV" == "production" ]]; then
    print_step "Creating backup directory..."
    BACKUP_DIR="$HOME/backups/outline"
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        print_success "Created backup directory: $BACKUP_DIR"
    else
        print_success "Backup directory exists: $BACKUP_DIR"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ Initialization Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ "$ENV" == "dev" ]]; then
    echo -e "${BLUE}📝 Next Steps:${NC}"
    echo ""
    echo "   Start the development server:"
    echo -e "   ${GREEN}./start.sh${NC}"
    echo ""
    echo "   Or use Make:"
    echo -e "   ${GREEN}make up${NC}"
    echo ""
    echo "   The application will be available at:"
    echo "   • Backend:  http://localhost:3000"
    echo "   • Frontend: http://localhost:3001 (Vite dev server)"
    echo ""
    echo "   To stop Docker services:"
    echo -e "   ${GREEN}docker compose down${NC}"
    echo ""
else
    echo -e "${BLUE}📝 Next Steps (Production):${NC}"
    echo ""
    echo "   1. Edit your .env file with production values:"
    echo -e "      ${YELLOW}nano .env${NC}"
    echo ""
    echo "   2. Set required variables:"
    echo "      • SECRET_KEY (generate with: openssl rand -hex 32)"
    echo "      • UTILS_SECRET (generate with: openssl rand -hex 32)"
    echo "      • DATABASE_URL (PostgreSQL connection string)"
    echo "      • REDIS_URL (Redis connection string)"
    echo "      • URL (public URL of your instance)"
    echo "      • At least one auth provider (GOOGLE_*, SLACK_*, etc.)"
    echo ""
    echo "   3. Run database migrations:"
    echo -e "      ${GREEN}yarn db:migrate${NC}"
    echo ""
    echo "   4. Start the production server:"
    echo -e "      ${GREEN}./start.sh${NC}"
    echo ""
    echo "   5. Setup automated backups (optional):"
    echo -e "      ${GREEN}./backup-manage.sh schedule${NC}"
    echo ""
fi

echo -e "${BLUE}📚 Documentation:${NC}"
echo "   • README.md - Project overview"
echo "   • WARP.md - Development guide"
echo "   • OPERATION_GUIDE.md - Operations guide"
echo "   • docs/SERVICES.md - Service architecture"
echo ""

if [[ "$ENV" == "dev" ]]; then
    echo -e "${BLUE}🛠️  Useful Commands:${NC}"
    echo "   • make test         - Run tests"
    echo "   • yarn lint         - Lint code"
    echo "   • yarn format       - Format code"
    echo "   • ./stop.sh         - Stop the server"
    echo "   • ./status.sh       - Check status"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
