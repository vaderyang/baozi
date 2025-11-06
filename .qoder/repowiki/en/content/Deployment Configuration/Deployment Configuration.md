# Deployment Configuration

<cite>
**Referenced Files in This Document**   
- [.env.development](file://.env.development)
- [.env.test](file://.env.test)
- [Dockerfile](file://Dockerfile)
- [docker-compose.yml](file://docker-compose.yml)
- [server/env.ts](file://server/env.ts)
- [app/env.ts](file://app/env.ts)
- [house-docker-compose/build_docker_and_release.sh](file://house-docker-compose/build_docker_and_release.sh)
- [server/utils/ssl.ts](file://server/utils/ssl.ts)
- [server/storage/database.ts](file://server/storage/database.ts)
- [server/storage/redis.ts](file://server/storage/redis.ts)
- [server/index.ts](file://server/index.ts)
- [server/utils/RateLimiter.ts](file://server/utils/RateLimiter.ts)
- [server/config/database.js](file://server/config/database.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Environment Variables and Configuration](#environment-variables-and-configuration)
3. [Containerized Deployment with Docker](#containerized-deployment-with-docker)
4. [Automated Build and Release Processes](#automated-build-and-release-processes)
5. [External Services Configuration](#external-services-configuration)
6. [SSL/TLS Setup](#ssltls-setup)
7. [Production Environment Considerations](#production-environment-considerations)
8. [Deployment Examples](#deployment-examples)
9. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive guidance on deploying and managing the baozi application across different environments. It covers configuration management, containerization, automated deployment processes, external service integration, security setup, and production best practices. The content is designed to serve both beginners setting up a development environment and experienced developers managing complex production deployments. The document uses terminology consistent with the codebase such as 'environment', 'configuration', 'containers', and 'services' to ensure clarity and alignment with the application's architecture.

## Environment Variables and Configuration

The baozi application uses environment variables for configuration management, allowing flexible deployment across different environments. The configuration system is implemented in `server/env.ts`, which defines a comprehensive set of environment variables with validation and default values.

The application supports multiple environment files including `.env.development` and `.env.test`, which contain environment-specific configurations. These files define critical settings such as database connections, Redis URLs, and service endpoints. The `Environment` class in `server/env.ts` validates these variables at startup, ensuring configuration integrity.

Key environment variables include:
- `DATABASE_URL`: PostgreSQL database connection string
- `REDIS_URL`: Redis connection URL for caching and session storage
- `URL`: The fully qualified external facing domain name
- `SECRET_KEY`: Secret key for data encryption
- `PORT`: Server listening port (default: 3000)
- `LOG_LEVEL`: Server log severity level (error, warn, info, http, verbose, debug, silly)

The configuration system implements validation using decorators from `class-validator`, ensuring that environment variables meet required criteria. For example, `DATABASE_URL` must be a valid URL with postgres or postgresql protocol, and `SECRET_KEY` must be 32-64 characters long. The system also handles conditional requirements, such as `SSL_CERT` requiring `SSL_KEY` to be present.

**Section sources**
- [server/env.ts](file://server/env.ts#L29-L800)
- [.env.development](file://.env.development)
- [.env.test](file://.env.test)

## Containerized Deployment with Docker

The baozi application is designed for containerized deployment using Docker, with configuration provided in the `Dockerfile` and `docker-compose.yml` files. The Docker setup enables consistent deployment across different environments and simplifies dependency management.

The `Dockerfile` implements a multi-stage build process:
1. A base image containing dependencies
2. A runner image with Node.js runtime
3. Copying of build artifacts and server code
4. Configuration of non-root user for security
5. Setting up volume for persistent data storage

The container exposes port 3000 and includes a health check that verifies server availability by accessing the `/ _health` endpoint. The health check uses wget to ensure the server responds with "OK", providing a reliable way to monitor container health in orchestration systems.

The `docker-compose.yml` file defines services for the application's external dependencies:
- `redis`: Redis service for caching and session storage
- `postgres`: PostgreSQL database service

The compose configuration maps local ports 6379 and 5432 to the container ports, allowing local development and debugging. It also specifies user configurations for both services to enhance security.

```mermaid
graph TD
A[Docker Container] --> B[Node.js Runtime]
A --> C[Application Code]
A --> D[Health Check]
A --> E[Volume Mount]
F[docker-compose.yml] --> G[Redis Service]
F --> H[PostgreSQL Service]
G --> I[Port 6379]
H --> J[Port 5432]
```

**Diagram sources **
- [Dockerfile](file://Dockerfile#L1-L54)
- [docker-compose.yml](file://docker-compose.yml#L1-L16)

**Section sources**
- [Dockerfile](file://Dockerfile#L1-L54)
- [docker-compose.yml](file://docker-compose.yml#L1-L16)

## Automated Build and Release Processes

The baozi application includes automated build and release processes in the `house-docker-compose/` directory, specifically the `build_docker_and_release.sh` script. This script orchestrates the complete build, tagging, and deployment process for containerized applications.

The build process follows these steps:
1. Synchronizes with the remote Git repository to ensure the latest code
2. Collects version information from user input or prompts
3. Generates build metadata including timestamp and Git hash
4. Builds a base Docker image with build arguments
5. Builds the application Docker image using the base image
6. Stops and removes any running containers using the old image
7. Deploys the new container using docker-compose

The script implements several best practices:
- Uses `set -euo pipefail` for strict error handling
- Supports both `docker compose` and `docker-compose` commands for compatibility
- Prunes dangling images to clean up unused layers
- Uses SSH with specific options for secure Git operations
- Implements graceful container replacement to minimize downtime

The automation script also handles deployment scenarios where other services may be running, either starting all services if none are running or restarting only the outline service if other services are active. This flexibility allows for targeted updates without disrupting the entire system.

```mermaid
flowchart TD
A[Start Build Process] --> B[Synchronize with Git Repository]
B --> C[Collect Version Information]
C --> D[Generate Build Metadata]
D --> E[Build Base Docker Image]
E --> F[Build Application Docker Image]
F --> G[Stop Old Containers]
G --> H[Deploy New Container]
H --> I[Prune Dangling Images]
I --> J[Complete Deployment]
```

**Diagram sources **
- [house-docker-compose/build_docker_and_release.sh](file://house-docker-compose/build_docker_and_release.sh#L1-L111)

**Section sources**
- [house-docker-compose/build_docker_and_release.sh](file://house-docker-compose/build_docker_and_release.sh#L1-L111)

## External Services Configuration

The baozi application integrates with several external services for enhanced functionality, including database, Redis, and storage providers. These services are configured through environment variables and specialized configuration files.

### Database Configuration
The application uses PostgreSQL as its primary database, with configuration managed through environment variables and the `server/config/database.js` file. The configuration supports both direct component specification and full database URL approaches.

Key database configuration variables:
- `DATABASE_URL`: Complete database connection string
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`: Individual database components
- `DATABASE_SCHEMA`: Optional database schema
- `DATABASE_CONNECTION_POOL_URL`: Database connection pool URL
- `DATABASE_CONNECTION_POOL_MIN` and `DATABASE_CONNECTION_POOL_MAX`: Connection pool size configuration
- `PGSSLMODE`: SSL connection mode (disable, allow, require, prefer, verify-ca, verify-full)

The application implements SSL connection handling based on the environment, with automatic configuration for production environments. The `server/storage/database.ts` file contains the database connection logic, including error handling for SSL-related issues.

### Redis Configuration
Redis is used for caching, session storage, and real-time collaboration. The configuration is managed through:
- `REDIS_URL`: Primary Redis connection URL
- `REDIS_COLLABORATION_URL`: Separate Redis URL for collaboration service (enables horizontal scaling)

The `server/storage/redis.ts` file implements a Redis adapter with connection pooling and error handling. It supports both standard Redis URLs and base64-encoded configuration objects for complex setups.

### Storage Configuration
File storage is configurable with multiple options:
- Local storage with `FILE_STORAGE_LOCAL_ROOT_DIR`
- AWS S3 with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and related variables
- Configurable storage type via `FILE_STORAGE` (local or s3)

The storage system includes size limits for uploads and imports, with separate limits for regular files and imports to accommodate larger import files.

```mermaid
graph TD
A[Application] --> B[Database Configuration]
A --> C[Redis Configuration]
A --> D[Storage Configuration]
B --> E[PostgreSQL]
B --> F[Connection Pooling]
B --> G[SSL Configuration]
C --> H[Primary Redis]
C --> I[Collaboration Redis]
D --> J[Local Storage]
D --> K[AWS S3]
D --> L[Size Limits]
```

**Diagram sources **
- [server/env.ts](file://server/env.ts#L79-L179)
- [server/config/database.js](file://server/config/database.js#L1-L24)
- [server/storage/database.ts](file://server/storage/database.ts#L37-L128)
- [server/storage/redis.ts](file://server/storage/redis.ts#L1-L124)

**Section sources**
- [server/env.ts](file://server/env.ts#L79-L179)
- [server/config/database.js](file://server/config/database.js#L1-L24)
- [server/storage/database.ts](file://server/storage/database.ts#L37-L128)
- [server/storage/redis.ts](file://server/storage/redis.ts#L1-L124)

## SSL/TLS Setup

The baozi application supports SSL/TLS termination for secure HTTPS connections. The SSL configuration is managed through environment variables and the `server/utils/ssl.ts` file.

SSL can be configured in multiple ways:
1. Base64-encoded key and certificate via `SSL_KEY` and `SSL_CERT` environment variables
2. Certificate files in the filesystem (`private.key`, `private.pem`, `public.cert`, `public.pem`)
3. Certificate files in a specific directory (`server/config/certs/`)

The `getSSLOptions` function in `server/utils/ssl.ts` implements a fallback mechanism that attempts to load SSL certificates from environment variables first, then from filesystem locations. This provides flexibility in deployment scenarios where certificates may be provided through different mechanisms.

Key SSL-related environment variables:
- `SSL_KEY`: Base64-encoded private key
- `SSL_CERT`: Base64-encoded public certificate
- `PGSSLMODE`: SSL mode for database connections (disable, allow, require, prefer, verify-ca, verify-full)
- `FORCE_HTTPS`: Whether to auto-redirect to HTTPS in production

The application automatically configures HTTPS when valid SSL certificates are detected. The `server/index.ts` file checks for SSL options and creates an HTTPS server when both key and certificate are available, otherwise falling back to HTTP.

```mermaid
flowchart TD
A[SSL Configuration] --> B[Check Environment Variables]
B --> C{SSL_KEY and SSL_CERT Set?}
C --> |Yes| D[Decode Base64 Certificates]
C --> |No| E[Check Filesystem]
E --> F{Certificate Files Exist?}
F --> |Yes| G[Read Certificate Files]
F --> |No| H[No SSL Configuration]
D --> I[Configure HTTPS Server]
G --> I
H --> J[Configure HTTP Server]
I --> K[Start Server]
J --> K
```

**Diagram sources **
- [server/env.ts](file://server/env.ts#L287-L297)
- [server/utils/ssl.ts](file://server/utils/ssl.ts#L1-L45)
- [server/index.ts](file://server/index.ts#L63-L66)

**Section sources**
- [server/env.ts](file://server/env.ts#L287-L297)
- [server/utils/ssl.ts](file://server/utils/ssl.ts#L1-L45)
- [server/index.ts](file://server/index.ts#L63-L66)

## Production Environment Considerations

Deploying the baozi application to production requires careful consideration of performance, security, and reliability. The application includes several features and configuration options specifically designed for production environments.

### Performance Configuration
Key performance-related settings include:
- `WEB_CONCURRENCY`: Number of processes to spawn (based on available memory)
- `REQUEST_TIMEOUT`: Request processing timeout (default: 10 seconds)
- `DATABASE_CONNECTION_POOL_MAX` and `DATABASE_CONNECTION_POOL_MIN`: Database connection pool size
- `WORKER_CONCURRENCY_EVENTS` and `WORKER_CONCURRENCY_TASKS`: Worker concurrency settings

The application uses the `throng` library to manage multiple worker processes, improving throughput and resource utilization. The number of processes is determined by the `WEB_CONCURRENCY` environment variable, with a recommendation to divide available memory by 512MB for estimation.

### Security Configuration
The application implements several security measures:
- Rate limiting via `RATE_LIMITER_ENABLED`, `RATE_LIMITER_REQUESTS`, and `RATE_LIMITER_DURATION_WINDOW`
- Content Security Policy (CSP) headers
- Secure Redis connections with TLS when using rediss:// URLs
- Input validation for all environment variables
- Non-root user execution in Docker containers

The rate limiting system uses Redis to track requests and prevent abuse. The `server/utils/RateLimiter.ts` file implements a flexible rate limiting framework that can be customized for different endpoints.

### Monitoring and Logging
Production deployments should configure:
- `LOG_LEVEL`: Set to appropriate level for production (typically 'info' or 'warn')
- `SENTRY_DSN`: Sentry integration for error tracking
- `DD_API_KEY` and `DD_SERVICE`: Datadog integration for metrics
- `TELEMETRY`: Enable or disable anonymous usage statistics

The application includes a health check endpoint at `/ _health` that verifies database and Redis connectivity, providing a reliable way to monitor application health in production.

```mermaid
graph TD
A[Production Deployment] --> B[Performance]
A --> C[Security]
A --> D[Monitoring]
B --> E[WEB_CONCURRENCY]
B --> F[REQUEST_TIMEOUT]
B --> G[Connection Pooling]
C --> H[Rate Limiting]
C --> I[CSP Headers]
C --> J[Input Validation]
D --> K[Health Check]
D --> L[Logging]
D --> M[Error Tracking]
```

**Diagram sources **
- [server/env.ts](file://server/env.ts#L253-L305)
- [server/utils/RateLimiter.ts](file://server/utils/RateLimiter.ts#L1-L102)
- [server/index.ts](file://server/index.ts#L149-L168)

**Section sources**
- [server/env.ts](file://server/env.ts#L253-L305)
- [server/utils/RateLimiter.ts](file://server/utils/RateLimiter.ts#L1-L102)
- [server/index.ts](file://server/index.ts#L149-L168)

## Deployment Examples

This section provides practical examples of deploying the baozi application to different environments, demonstrating how to manage configuration across stages.

### Development Environment Setup
For local development, create a `.env.development` file with the following content:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/outline
REDIS_URL=redis://localhost:6379
URL=http://localhost:3000
SECRET_KEY=your-secret-key-here
DEBUG=http,database
LOG_LEVEL=debug
```

Start the services using docker-compose:
```bash
docker-compose up -d
```

### Production Deployment with SSL
For production deployment with SSL termination, configure the environment variables:
```
DATABASE_URL=postgresql://user:pass@db.example.com:5432/outline
REDIS_URL=redis://redis.example.com:6379
URL=https://example.com
SECRET_KEY=your-production-secret-key
SSL_KEY=base64-encoded-private-key
SSL_CERT=base64-encoded-certificate
FORCE_HTTPS=true
LOG_LEVEL=info
WEB_CONCURRENCY=4
```

Build and deploy using the automated script:
```bash
cd house-docker-compose
./build_docker_and_release.sh production
```

### Staging Environment with External Services
For a staging environment with external services, configure:
```
DATABASE_URL=postgresql://user:pass@staging-db.example.com:5432/outline
REDIS_URL=redis://staging-redis.example.com:6379
URL=https://staging.example.com
SECRET_KEY=your-staging-secret-key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=user
SMTP_PASSWORD=password
SMTP_FROM_EMAIL=noreply@example.com
SENTRY_DSN=https://your-sentry-dsn
```

This configuration connects to external database and Redis services, configures email delivery, and enables error tracking with Sentry.

## Conclusion
The baozi application provides a comprehensive and flexible deployment configuration system that supports various environments from development to production. The configuration is managed through environment variables with robust validation, ensuring reliability and security. Containerization with Docker and docker-compose simplifies deployment and dependency management, while the automated build and release scripts streamline the deployment process.

The application's integration with external services like PostgreSQL, Redis, and AWS S3 provides scalability and flexibility, while SSL/TLS support ensures secure communications. Production considerations include performance tuning, security hardening, and monitoring integration, making the application suitable for enterprise deployments.

By following the configuration patterns and examples provided in this document, teams can successfully deploy and manage the baozi application across different environments, ensuring consistency, reliability, and security.