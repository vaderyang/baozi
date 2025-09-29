# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Context (Read First)
- **Tech Stack**: React 17 + TypeScript frontend, Node.js + Koa backend, PostgreSQL + Sequelize ORM, Redis + Bull queues
- **Main Architecture**: Full-stack TypeScript monorepo with collaborative real-time editor
- **Core Feature**: Knowledge base with ProseMirror-based collaborative editing using Y.js
- **Key Integration**: Multi-provider OAuth (Google, Slack, Discord, Azure), S3-compatible file storage
- **Platform Support**: Self-hosted or hosted service, Docker deployment
- **DO NOT**: Commit sensitive keys, modify database schema without migrations, break real-time collaboration

## Essential Commands

### Development Setup
```bash
# Start development environment (requires Docker for PostgreSQL/Redis)
make up                          # Starts services + installs SSL certs + runs dev:watch

# Alternative manual setup
docker compose up -d redis postgres
yarn install-local-ssl          # Installs local SSL certificates
yarn install --pure-lockfile
yarn dev:watch                  # Runs backend + frontend with hot reload
```

### Development Commands
```bash
# Frontend + Backend development
yarn dev:watch                  # Both frontend and backend with hot reload
yarn dev:backend               # Backend only with nodemon
yarn vite:dev                  # Frontend only

# Individual services
yarn dev                       # Runs API, collaboration, websockets, admin, web, worker services
```

### Build & Production
```bash
yarn build                     # Full production build (clean + vite + i18n + server)
yarn start                     # Start production server
yarn clean                     # Clean build directory
```

### Database Operations
```bash
yarn db:create-migration --name migration-name  # Create new migration
yarn db:migrate                                 # Run pending migrations
yarn db:rollback                               # Rollback last migration
yarn db:reset                                  # Drop, create, migrate database
yarn upgrade                                   # Git pull + install + migrate
```

### Testing
```bash
# Run all tests
make test                       # Runs tests with fresh test database
yarn test                      # Run all test suites

# Specific test suites
yarn test:server               # Backend tests only
yarn test:app                  # Frontend tests only
yarn test:shared              # Shared code tests

# Development testing
make watch                     # Run tests in watch mode
yarn test path/to/file.test.ts --watch  # Single test file in watch mode
```

### Code Quality
```bash
yarn lint                     # Run oxlint on all TypeScript files
yarn lint:changed            # Lint only changed files (git diff)
yarn format                  # Format code with Prettier
yarn format:check            # Check formatting without changes
```

### Internationalization
```bash
yarn build:i18n              # Extract and build translation files
```

## Architecture Overview

### Project Structure
```
├── app/           # React frontend (MobX, Styled Components, React Router)
├── server/        # Node.js backend (Koa, Sequelize, Bull queues)
├── shared/        # Shared TypeScript utilities and components
├── plugins/       # Plugin system for integrations
├── build/         # Compiled output
└── docker-compose.yml  # PostgreSQL + Redis for development
```

### Key Technologies
- **Frontend**: React 17, TypeScript, MobX state management, Styled Components, Vite build tool
- **Backend**: Node.js, Koa framework, TypeScript, Sequelize ORM, Bull job queues
- **Database**: PostgreSQL with full-text search, Redis for caching/queues
- **Editor**: ProseMirror with Y.js for real-time collaboration
- **Real-time**: Socket.io + Hocuspocus for collaborative editing
- **Authentication**: Passport.js with OAuth providers
- **Testing**: Jest with separate configs for app/server/shared

### Service Architecture
- **web**: Main web application server
- **api**: REST API endpoints
- **collaboration**: Real-time collaborative editing server
- **worker**: Background job processing
- **cron**: Scheduled tasks
- **admin**: Administrative interface
- **websockets**: WebSocket connections

### Database Models (Key Entities)
- **User**: Authentication and user management
- **Team**: Multi-tenant organization structure
- **Document**: Core content with collaborative editing
- **Collection**: Hierarchical document organization
- **Comment**: Document annotations and discussions
- **Attachment**: File uploads and media

## Development Patterns

### File Organization
- **Co-located**: Components, styles, and tests live together
- **Path Aliases**: Use `~/` for app, `@server/` for server, `@shared/` for shared code
- **Models**: MobX observables in `app/models/`, Sequelize models in `server/models/`
- **API Routes**: RESTful endpoints in `server/routes/api/`

### Testing Strategy
- **Test Files**: Use `.test.ts` extension next to source files
- **Coverage**: Focus on API endpoints and authentication-critical code
- **Environments**: Separate Jest configs for frontend (jsdom) and backend (node)

### State Management
- **Frontend**: MobX stores in `app/stores/` with observable models
- **Backend**: Sequelize models with authorization policies in `server/policies/`

### Styling
- **Styled Components**: Component-level styling with theme support
- **Global Styles**: Shared design tokens in `shared/styles/`

### Real-time Collaboration
- **ProseMirror**: Rich text editor with plugins
- **Y.js**: Operational transforms for conflict-free collaborative editing
- **Socket.io**: Real-time communication layer

## Environment Configuration

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SECRET_KEY`: 32-byte hex key for encryption (`openssl rand -hex 32`)
- `UTILS_SECRET`: Unique random key
- `URL`: Fully qualified public URL

### Optional Configuration
- `COLLABORATION_URL`: Separate collaboration server URL
- `CDN_URL`: Content delivery network URL
- `WEB_CONCURRENCY`: Number of worker processes
- `DEFAULT_LANGUAGE`: Interface language (default: en_US)

## Common Workflows

### Adding New Features
1. **Database**: Create migration if schema changes needed
2. **Backend**: Add API routes, models, policies as needed
3. **Frontend**: Create components, stores, and routing
4. **Tests**: Add tests for new API endpoints
5. **Types**: Update TypeScript definitions

### Plugin Development
- Extend functionality via plugin system in `plugins/` directory
- Follow existing plugin patterns for integrations

### Debugging
- **Development**: Console logging with category prefixes
- **Production**: JSON structured logging
- **HTTP Logging**: Set `DEBUG=http` environment variable
- **Verbose Logging**: Set `LOG_LEVEL=debug` or `LOG_LEVEL=silly`

## Important Notes

### Authentication Flow
- Multi-provider OAuth with Passport.js strategies
- JWT tokens for API authentication
- Policy-based authorization using cancan

### File Storage
- Configurable between local filesystem and S3-compatible storage
- Upload handling with support for various document formats

### Real-time Features
- Collaborative document editing with conflict resolution
- Live cursor positions and user presence
- Comment threads with real-time updates

### Performance Considerations
- Database connection pooling configuration
- Redis caching for session and collaboration data
- Bull queues for async processing to avoid blocking requests

### Security
- CSRF protection enabled
- Rate limiting middleware
- SSL/TLS support in development and production
- Environment-based configuration isolation