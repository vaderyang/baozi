# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is an Outline wiki application - a knowledge base built with React and Node.js. The codebase is a TypeScript monorepo with three main directories:
- `app/` - React frontend (Vite, MobX, Styled Components)  
- `server/` - Node.js backend (Koa, Sequelize, PostgreSQL, Redis)
- `shared/` - Code shared between frontend and backend (including ProseMirror editor)
- `plugins/` - Authentication and integration plugins (Google, Slack, GitHub, etc.)

## Essential Commands

### Development
```bash
# Start development environment (requires Docker for Redis/Postgres)
make up                    # Starts dependencies and dev server with hot reload
yarn dev:watch            # Alternative: run frontend and backend concurrently

# Run individual parts
yarn vite:dev             # Frontend only (port 3001)
yarn dev:backend          # Backend only with nodemon
yarn dev                  # Backend services only
```

### Building
```bash
yarn build                # Full production build (frontend, i18n, backend)
yarn clean                # Remove build directory
yarn vite:build           # Build frontend only
yarn build:server         # Build backend only
yarn build:i18n           # Build i18n translations
```

### Testing
```bash
make test                 # Run all tests (creates test DB automatically)
make watch                # Run tests in watch mode

# Run specific test suites
yarn test:server          # Backend tests only
yarn test:app             # Frontend tests only  
yarn test:shared          # Shared code tests
yarn test path/to/file.test.ts --watch  # Single test file in watch mode
```

### Database Operations
```bash
# Migrations
yarn db:create-migration --name my-migration  # Create new migration
yarn db:migrate           # Run pending migrations
yarn db:rollback          # Undo last migration
yarn db:reset             # Drop, recreate, and migrate database

# Test database
yarn db:migrate --env test  # Migrate test database
```

### Code Quality
```bash
yarn lint                 # Lint with oxlint (type-aware)
yarn lint:changed         # Lint only changed files
yarn format               # Format with Prettier
yarn format:check         # Check formatting without changes
```

### Operations (Production)
```bash
./start.sh                # Start production server
./stop.sh                 # Stop production server  
./restart.sh              # Restart production server
./status.sh               # Check server and dependencies status

# Backup & Restore
./backup.sh               # Create manual backup
./backup-manage.sh list   # List available backups
./backup-manage.sh restore <file>  # Restore from backup
./backup-manage.sh schedule  # Setup automated daily backups
```

## Architecture Fundamentals

### Frontend Architecture (`app/`)
- **State Management**: MobX with observable models and stores pattern
- **Routing**: React Router v5 with async route chunks (see `app/routes/`)
- **Styling**: Styled Components with co-located styles in component files
- **Key Directories**:
  - `actions/` - Reusable navigation and entity operations
  - `stores/` - MobX stores (collections of models with fetch logic)
  - `models/` - MobX observable models representing entities
  - `scenes/` - Full-page views composed of components
  - `components/` - Reusable React components
  - `editor/` - Editor-specific React components
  - `hooks/` - Custom React hooks
  - `menus/` - Context menu definitions

### Backend Architecture (`server/`)
- **Framework**: Koa with async/await throughout
- **ORM**: Sequelize with TypeScript decorators
- **Background Jobs**: Bull queues with Redis
- **Authorization**: Cancan-style policies in `policies/`
- **Key Directories**:
  - `routes/api/` - API endpoints
  - `routes/auth/` - Authentication routes
  - `models/` - Sequelize models with decorators
  - `commands/` - Complex multi-model operations
  - `presenters/` - API response serializers (model → JSON)
  - `queues/processors/` - Event bus job processors
  - `queues/tasks/` - Async task definitions
  - `services/` - Separate application services (web, worker, collaboration, websockets, admin, cron)
  - `middlewares/` - Shared Koa middleware
  - `migrations/` - Database migration files

### Shared Code (`shared/`)
- **Editor**: ProseMirror-based rich text editor
  - `editor/nodes/` - Document node definitions
  - `editor/marks/` - Text formatting marks
  - `editor/commands/` - Editor commands
  - `editor/plugins/` - ProseMirror plugins
  - `editor/embeds/` - Embeddable content integrations
- **i18n**: Internationalization with locales in `i18n/locales/`
- **Utils**: Shared utilities between frontend and backend

### Services Architecture
The backend can run as separate services (see `server/services/`):
- **web** - Main API and application server (required)
- **worker** - Background job processor (required)  
- **collaboration** - Real-time collaborative editing (via Hocuspocus)
- **websockets** - WebSocket server for real-time updates
- **admin** - Queue monitoring UI (development only)
- **cron** - Scheduled tasks

Configure via `--services` flag or `SERVICES` env var:
```bash
yarn start --services=web,worker,collaboration
```

## Path Aliases
- `~/*` → `./app/*` (frontend code)
- `@server/*` → `./server/*` (backend code)
- `@shared/*` → `./shared/*` (shared code)

## Testing Strategy
- Test files are co-located with source files (`.test.ts` extension)
- Jest with 4 projects: `server`, `app`, `shared-node`, `shared-jsdom`
- Backend tests use Node environment, frontend tests use jsdom
- API endpoints and authentication should have thorough test coverage
- Test database is automatically created by `make test`

## Environment Configuration
- `.env.development` - Local development settings
- `.env.test` - Test environment settings
- `.env.sample` - Template with all available options
- Key variables: `DATABASE_URL`, `REDIS_URL`, `URL`, `SECRET_KEY`, `UTILS_SECRET`

## Database & Migrations
- Sequelize CLI configured via `.sequelizerc`
- Migrations are in `server/migrations/`
- Models use TypeScript decorators (`sequelize-typescript`)
- Always create migrations for schema changes
- Test migrations against test database before production

## Plugin System
Plugins in `plugins/` directory provide:
- Authentication providers (Google, Slack, Azure, OIDC, etc.)
- Integrations (Linear, Notion, GitHub, Discord)
- Analytics (Google Analytics, Matomo, Umami)
- Storage backends
- Webhooks

Each plugin exports server-side and/or client-side components.

## Build Output
- Frontend: `build/app/` (Vite output with manifest)
- Backend: `build/server/` (Babel-compiled Node.js)
- Translations: `build/shared/i18n/locales/`

## Development Workflow
1. Start dependencies: `docker compose up -d redis postgres`
2. Install SSL certs: `yarn install-local-ssl` (for HTTPS in dev)
3. Start development: `make up` or `yarn dev:watch`
4. Frontend runs on port 3001 (Vite dev server)
5. Backend proxies to frontend in development
6. Changes to backend trigger rebuild and restart (nodemon)
7. Frontend has HMR via Vite

## Important Notes
- Node version: 20 or 22 (see `.nvmrc`)
- Package manager: Yarn 1.22.22 (specified in `packageManager` field)
- Linting: oxlint (not ESLint) with type-aware checking
- The project uses experimental decorators and decorator metadata
- Redis is required for queues and caching
- PostgreSQL is the only supported database
- The editor is based on ProseMirror with custom nodes/marks
- Real-time collaboration uses Yjs with Hocuspocus
