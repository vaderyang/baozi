# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Outline** is a fast, collaborative knowledge base for teams built with React and Node.js. This is a fork ("baozi") with custom AI features including:
- Three-tier AI model system (Primary/Task/Fallback)
- Audio transcription and meeting AI features
- AI-powered search, generation, and conversation (RAG)

**Tech Stack**: TypeScript, React, Node.js, Koa, Sequelize, MobX, Styled Components, PostgreSQL, Redis

**Key Custom Features**:
- Three-tier LLM architecture (`zai-glm-4.6` primary, `qwen3-30b-a3b-instruct` task, `GLM-4.6` fallback)
- Audio transcription service integration
- Meeting AI with transcript cards and time-segmented summaries
- AI Ask (conversational RAG), AI Search, AI Generate features

## Development Commands

### Setup and Running
```bash
# Initial setup (starts Redis/Postgres via Docker, installs dependencies, runs dev)
make up

# Development with auto-reload (backend + frontend)
yarn dev:watch

# Backend only with nodemon
yarn dev:backend

# Frontend only
yarn vite:dev

# Production build
yarn build

# Start production server
yarn start
```

### Testing
```bash
# Run all tests (sets up test database automatically)
make test

# Backend tests in watch mode
make watch

# Specific test suites
yarn test:server        # All server tests
yarn test:app           # All frontend tests
yarn test:shared        # Shared code tests

# Run single test file
yarn test path/to/file.test.ts

# Run specific test by name
yarn test path/to/file.test.ts -t "test name pattern"

# Watch mode for specific file
yarn test path/to/file.test.ts --watch

# AI infrastructure tests (custom test suite)
./scripts/test-ai-infrastructure.sh --all           # All AI tests
./scripts/test-ai-infrastructure.sh --benchmark     # Performance benchmarks
./scripts/test-ai-infrastructure.sh --unit          # Model config tests
./scripts/test-ai-infrastructure.sh --integration   # AI features integration
./scripts/test-ai-infrastructure.sh --fallback      # Fallback mechanism tests
./scripts/test-ai-infrastructure.sh --task          # Task model tests
./scripts/test-ai-infrastructure.sh --verbose       # Detailed output
./scripts/test-ai-infrastructure.sh --coverage      # With coverage report
```

**Important**: Tests require `BABEL_ENV=test NODE_ENV=test` environment variables. This is already configured in `package.json` test scripts.

### Database Migrations
```bash
# Create new migration
yarn db:create-migration --name my-migration

# Run migrations
yarn db:migrate

# Rollback last migration
yarn db:rollback

# Reset database (drop, create, migrate)
yarn db:reset

# Run migrations on test database
yarn db:migrate --env test
```

### Code Quality
```bash
# Lint (uses oxlint)
yarn lint

# Lint only changed files
yarn lint:changed

# Format code (Prettier)
yarn format

# Check formatting
yarn format:check
```

### Docker
```bash
# Build Docker image
make build

# Stop and remove containers
make destroy
```

## Architecture

### Monorepo Structure

```
├── app/              # React frontend (Vite + MobX + Styled Components)
│   ├── actions/      # Reusable actions (navigate, open, create entities)
│   ├── components/   # Reusable React components
│   ├── editor/       # Editor-specific components
│   ├── hooks/        # React hooks
│   ├── menus/        # Context menus
│   ├── models/       # MobX observable models
│   ├── routes/       # Route definitions (async loaded)
│   ├── scenes/       # Full-page views
│   ├── stores/       # Model collections + fetch logic
│   └── utils/        # Frontend utilities
│
├── server/           # Node.js backend (Koa + Sequelize + Redis/Bull)
│   ├── routes/       # API routes
│   │   ├── api/      # Main API endpoints
│   │   │   └── ai/   # AI features (Ask, Search, Generate, Suggest)
│   │   └── auth/     # Authentication routes
│   ├── commands/     # Multi-model operations
│   ├── emails/       # Email templates
│   ├── middlewares/  # Koa middlewares
│   ├── migrations/   # Database migrations
│   ├── models/       # Sequelize models
│   ├── policies/     # Authorization logic (cancan)
│   ├── presenters/   # JSON API presenters
│   ├── queues/       # Async queues
│   │   ├── processors/  # Event bus processors
│   │   └── tasks/       # Async tasks
│   ├── services/     # Service entry points (api, worker, collaboration)
│   ├── test/         # Test helpers and fixtures
│   └── utils/        # Backend utilities
│
├── shared/           # Code shared between frontend and backend
│   ├── editor/       # Prosemirror-based text editor
│   ├── i18n/         # Internationalization
│   │   └── locales/  # Translation files
│   ├── styles/       # Global styles and colors
│   └── utils/        # Shared utilities
│
└── plugins/          # Plugin system
```

### Key Backend Files

**AI Infrastructure**:
- `server/routes/api/ai/ai.ts` - Main AI router with three-tier model selection
- `server/routes/api/ai/schema.ts` - API schemas and validation
- `server/routes/api/audio/audio.ts` - Audio transcription endpoints
- `server/services/AIArchiveSuggestionService.ts` - Archive/title suggestions
- `server/env.ts` - Environment variable configuration

**Database**:
- `server/models/` - Sequelize models (User, Team, Document, Collection, etc.)
- `server/migrations/` - Database migrations
- `server/test/factories.ts` - Test factories for models

**Authorization**:
- `server/policies/` - cancan-based authorization policies

## Three-Tier AI Model System

### Model Selection Logic

The system automatically selects the appropriate model based on:
1. **Purpose**: `'primary'` (heavy tasks) or `'task'` (lightweight operations)
2. **Context length**: Automatically upgrades to primary if content exceeds task model limits
3. **Team preferences**: Can override defaults per team
4. **Fallback**: Automatically retries with fallback model on rate limits, context overflow, or service failures

### Configuration

**Environment Variables** (`.env`):
```bash
# LLM Configuration
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://api-url.com
LLM_PRIMARY_MODEL_NAME=zai-glm-4.6        # Default primary (200k context)
LLM_TASK_MODEL_NAME=qwen3-30b-a3b-instruct # Default task (15k context)
LLM_FALLBACK_MODEL_NAME=GLM-4.6           # Universal fallback
LLM_MAX_CONTEXT_LENGTH=15000              # Threshold for task→primary upgrade

# Optional specialized models
LLM_MODEL_NAME_AI_SEARCH=model-name       # Search-specific override
LLM_MODEL_NAME_SENSITIVE=model-name       # Privacy/sensitive data
LLM_MODEL_NAME_VISION=model-name          # Vision tasks
```

**Team Preferences** (`shared/types.ts`):
- `AiGenerateTextModel` - Primary model override for text generation
- `AiSearchModel` - Primary model override for search
- `AiTaskModel` - Task model override
- `AiFallbackModel` - Fallback model override
- `AiVisionModel` - Vision model override

### Model Usage by Feature

**Primary Model** (zai-glm-4.6, 200k context):
- AI Ask (conversational RAG)
- AI Search (semantic search with answers)
- AI Generate (editor text generation)
- Full document summaries

**Task Model** (qwen3-30b-a3b-instruct, 15k context):
- Document title generation
- Transcript segment summaries (5-min chunks)
- AI Suggestions (editor quick suggestions)
- Archive location suggestions
- Topic extraction and classification

**Fallback Model** (GLM-4.6, 200k context):
- Activated on rate limits (429)
- Context overflow errors (400 with context_length_exceeded)
- Service unavailable (500, 503)
- Any other provider failures

## Audio/Meeting AI Features

**Transcription Service**:
- External ASR service via `TRANSCRIPTION_ENDPOINT` environment variable
- Audio files uploaded via `/api/audio.upload` endpoint
- Transcriptions stored in document body with `## Transcript` section
- TranscriptCard component renders audio player + transcript with time navigation

**Meeting AI Workflow**:
1. Upload audio → `/api/audio.upload` (stores as attachment)
2. Transcribe → External ASR service
3. Generate title → Task model (max 100 chars)
4. Generate segment summaries → Task model (5-min segments with timestamps)
5. Display in TranscriptCard → Multi-tab UI (Audio, Transcript, Metadata)

## Testing Guidelines

### Test Structure

Tests are **colocated** with source code:
- API tests: `server/routes/api/**/*.test.ts`
- Model tests: `server/models/**/*.test.ts`
- Component tests: `app/components/**/*.test.ts`
- Shared tests: `shared/**/*.test.ts`

### AI Test Suite

Custom test suite for AI infrastructure with comprehensive coverage:

**Test Categories**:
1. **Model Configuration** (`modelConfig.test.ts`) - Three-tier model selection logic
2. **Fallback Mechanism** (`fallback.test.ts`) - Rate limit, context overflow, error handling
3. **AI Features** (`aiFeatures.integration.test.ts`) - Ask, Search, Generate integration
4. **Task Model** (`taskModel.test.ts`) - Title gen, summaries, suggestions
5. **LLM Benchmarks** (`llm.benchmark.test.ts`) - TPS, TTFT, latency metrics
6. **Workflow Benchmarks** (`workflow.benchmark.test.ts`) - End-to-end transcription→summary

**Test Utilities** (`server/routes/api/ai/__tests__/testUtils.ts`):
- `measureLLMPerformance()` - Measure latency, TPS, TTFT
- `measureStreamingPerformance()` - SSE streaming metrics
- `generateLargeContent()` - Generate test content of specific token size
- `generateSampleTranscript()` - Generate realistic transcript data
- `benchmarks.thresholds` - Performance expectations for each model

### Performance Expectations

| Operation | Model | Max Latency | Min TPS | Max TTFT |
|-----------|-------|-------------|---------|----------|
| Title Generation | Task | 3s | 20 tok/s | 1s |
| Segment Summary | Task | 3s | 20 tok/s | 1s |
| AI Suggestion | Task | 3s | 20 tok/s | 1s |
| AI Ask | Primary | 10s | 10 tok/s | 2s |
| AI Search | Primary | 10s | 10 tok/s | 2s |
| AI Generate | Primary | 10s | 10 tok/s | 2s |
| Transcription | ASR | 5s/min | - | - |
| Full Summary | Primary | 5s | 15 tok/s | - |

## Environment Configuration

### Required Variables

```bash
# Core
NODE_ENV=development
URL=http://localhost:3030
PORT=3030
SECRET_KEY=<generate with: openssl rand -hex 32>
UTILS_SECRET=<generate with: openssl rand -hex 32>

# Database
DATABASE_URL=postgres://outline:outline@localhost:5432/outline

# Redis
REDIS_URL=redis://localhost:6379

# File Storage
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=./data
```

### AI Features (Optional but Required for AI)

```bash
# LLM Configuration
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://api-url.com
LLM_PRIMARY_MODEL_NAME=zai-glm-4.6
LLM_TASK_MODEL_NAME=qwen3-30b-a3b-instruct
LLM_FALLBACK_MODEL_NAME=GLM-4.6

# AI Features
AI_ASK_ENABLED=true
AI_ASK_MAX_DOCUMENTS=20
AI_ASK_MAX_CONVERSATION_TURNS=10
AI_ASK_SESSION_TIMEOUT_MS=3600000

# Transcription
TRANSCRIPTION_ENDPOINT=http://asr-service:8000/transcribe
TRANSCRIPTION_DELETE_AUDIO_AFTER=false  # Keep audio as attachments
ALLOWED_PRIVATE_IP_ADDRESSES=172.16.103.100  # ASR service IP
```

### Test Environment

Create `.env.test` with same LLM configuration as `.env` but with test database:
```bash
NODE_ENV=test
DATABASE_URL=postgres://outline:outline@127.0.0.1:5432/outline-test
# ... copy LLM and transcription config from .env
```

## Important Development Notes

### Babel Configuration

The `.babelrc` file has environment-specific configurations:
- **Production/Development**: Ignores `**/*.test.ts` files
- **Test**: Must have `"ignore": []` to transform test files and `__mocks__` directories

**Critical**: Test commands **must** include `BABEL_ENV=test NODE_ENV=test` to ensure proper test environment detection. This is already configured in `package.json` scripts.

### Jest Configuration

Multi-project setup in `.jestconfig.json`:
- **server** project: Node environment, uses `server/test/setup.ts`
- **app** project: jsdom environment, uses `app/test/setup.ts`
- **shared-node** and **shared-jsdom** projects: For shared code testing

**Setup files**:
- `__mocks__/console.js` - Silences console warnings in tests
- `server/test/setup.ts` - Database setup, test helpers
- `server/test/factories.ts` - Model factories (buildUser, buildDocument, etc.)

### Authorization

Uses **cancan** for policy-based authorization:
- Policies in `server/policies/` (e.g., `document.ts`, `collection.ts`)
- `@authorized()` decorator in API routes
- `authorize()` utility function for programmatic checks

Example:
```typescript
@authorized()
router.post("documents.create", async (ctx) => {
  authorize(ctx.state.auth.user, "createDocument", collection);
  // ... create document
});
```

### API Development

**Key Patterns**:
1. Routes in `server/routes/api/[feature]/[feature].ts`
2. Schemas in `server/routes/api/[feature]/schema.ts` using Zod
3. Presenters in `server/presenters/` for JSON serialization
4. Commands in `server/commands/` for complex multi-model operations
5. Events in `server/models/base/` trigger async processors

**Example API Route**:
```typescript
import Router from "koa-router";
import { authorize } from "@server/middlewares/authorize";
import { Document } from "@server/models";
import presentDocument from "@server/presenters/document";
import { z } from "zod";

const router = new Router();

router.post(
  "documents.create",
  authorize(),
  validate(z.object({ title: z.string(), text: z.string() })),
  async (ctx) => {
    const { title, text } = ctx.input.body;
    const { user } = ctx.state.auth;

    const document = await Document.create({
      title,
      text,
      userId: user.id,
      teamId: user.teamId,
    });

    ctx.body = {
      data: presentDocument(document),
    };
  }
);

export default router;
```

## Documentation

**Key Docs**:
- `docs/ARCHITECTURE.md` - System architecture overview
- `AI_INFRA_REDESIGN.md` - Three-tier AI model system detailed design
- `AI_TEST_SUITE.md` - Comprehensive AI testing documentation
- `AI_TESTING_QUICK_START.md` - Quick reference for running AI tests
- `docs/AI_ASK_CONFIGURATION.md` - AI Ask feature configuration
- `docs/AI_SEARCH.md` - AI Search implementation details

**API Docs**: https://getoutline.com/developers

## Common Issues

### Tests Won't Run
- Ensure `BABEL_ENV=test NODE_ENV=test` is set (already in package.json scripts)
- Clear Jest cache: `yarn jest --clearCache`
- Check `.babelrc` test environment has `"ignore": []`

### Database Connection Issues
- Ensure PostgreSQL is running: `docker compose up -d postgres`
- Run migrations: `yarn db:migrate` or `NODE_ENV=test yarn db:migrate`

### AI Features Not Working
- Check LLM environment variables are set in `.env`
- Verify API key and base URL are correct
- Check model names match what provider expects
- Look for fallback triggers in logs (rate limits, context overflow)

### Build Failures
- Run `yarn clean` then `yarn build`
- Check TypeScript errors: The project uses TypeScript with strict mode
- Ensure all dependencies are installed: `yarn install --pure-lockfile`
