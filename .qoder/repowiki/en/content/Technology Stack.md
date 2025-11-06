# Technology Stack

<cite>
**Referenced Files in This Document**   
- [package.json](file://package.json)
- [docker-compose.yml](file://docker-compose.yml)
- [Dockerfile](file://Dockerfile)
- [vite.config.ts](file://vite.config.ts)
- [server/index.ts](file://server/index.ts)
- [app/index.tsx](file://app/index.tsx)
</cite>

## Table of Contents
1. [Frontend Stack](#frontend-stack)
2. [Backend Stack](#backend-stack)
3. [Real-Time Collaboration System](#real-time-collaboration-system)
4. [Testing Tools](#testing-tools)
5. [Deployment Technologies](#deployment-technologies)

## Frontend Stack

The baozi application's frontend is built on a modern JavaScript stack centered around React for UI components, Vite as the build tool, MobX for state management, and Prosemirror for rich text editing capabilities. The architecture follows a component-based design pattern with clear separation of concerns between presentation, logic, and data layers.

React serves as the foundation for building reusable UI components that efficiently update and render when application state changes. The component hierarchy is organized in the app/components directory, with specialized components for UI elements like buttons, dialogs, menus, and document views. The application uses React Router for navigation between different views and scenes within the single-page application.

Vite is configured as the build tool and development server, providing fast hot module replacement and optimized production builds. The vite.config.ts file configures Vite with React plugin support, custom aliases for module resolution, and service worker integration for offline capabilities. The build process generates optimized assets with hashed filenames for cache busting, while respecting content security policies by preventing asset inlining.

MobX provides state management through observable stores that power the application's reactive behavior. The stores are organized in the app/stores directory, with a RootStore that coordinates domain-specific stores for documents, collections, users, and other entities. MobX's transparent functional reactivity allows components to automatically re-render when observed state changes, reducing the need for manual state synchronization.

Prosemirror forms the core of the rich text editing system, extended with custom functionality through the app/editor/extensions directory. The editor supports collaborative editing, mathematical expressions via prosemirror-math, and various formatting options. The system integrates with Yjs for real-time collaboration, enabling multiple users to edit documents simultaneously with conflict-free synchronization.

**Section sources**
- [package.json](file://package.json#L100-L150)
- [vite.config.ts](file://vite.config.ts#L1-L167)
- [app/index.tsx](file://app/index.tsx#L1-L130)

## Backend Stack

The backend infrastructure of the baozi application is built on Koa, a modern web framework for Node.js that provides a minimalist middleware architecture. Koa serves as the foundation for handling HTTP requests, routing, and server-side logic, with a modular design that separates concerns across different service components.

Koa is configured with essential middleware for security, logging, and request processing. The server/index.ts file initializes the Koa application with helmet for security headers, logger for request logging, and rate limiting to prevent abuse. The routing system is built on koa-router, defining endpoints for various API services including document management, user authentication, and real-time collaboration.

Sequelize acts as the Object-Relational Mapping (ORM) layer, providing an abstraction over the PostgreSQL database. The models are defined in the server/models directory, with TypeScript support through sequelize-typescript decorators. Sequelize handles database migrations through the sequelize-cli tool, with migration files in the server/migrations directory that track schema changes over time. The ORM configuration in server/config/database.js establishes the connection to PostgreSQL and manages connection pooling.

PostgreSQL serves as the primary relational database, storing structured data including documents, collections, users, and permissions. The database schema is designed with referential integrity, using foreign key constraints and appropriate indexing for performance. The application leverages PostgreSQL's JSONB capabilities for flexible data storage while maintaining relational integrity for core entities.

Redis is utilized for multiple purposes: caching frequently accessed data, managing real-time collaboration state, and supporting background job processing. The application uses ioredis as the Redis client, with separate connections configured for different purposes. Redis enables efficient session storage, rate limiting, and pub/sub messaging for real-time features.

**Section sources**
- [package.json](file://package.json#L150-L200)
- [server/index.ts](file://server/index.ts#L1-L258)
- [docker-compose.yml](file://docker-compose.yml#L1-L16)

## Real-Time Collaboration System

The real-time collaboration system in baozi is built on Yjs, a CRDT-based framework for conflict-free replicated data types, combined with y-prosemirror for seamless integration with the Prosemirror editor. This architecture enables multiple users to simultaneously edit documents with automatic conflict resolution and eventual consistency.

Yjs provides the underlying data model and synchronization protocol, representing document content as shared types that can be collaboratively edited. The system uses operational transformation principles to ensure that concurrent edits from different clients converge to the same state without requiring centralized coordination. The collaboration service is implemented in the server/collaboration directory, with extensions for authentication, persistence, and metrics.

y-prosemirror bridges the gap between Yjs and Prosemirror, synchronizing changes between the CRDT data model and the Prosemirror document representation. When a user makes an edit, it is first applied to the Yjs document, which then propagates the change to all connected clients. Each client's Prosemirror instance receives the update through y-prosemirror, ensuring that the visual editor reflects the latest state.

The collaboration infrastructure is enhanced with Redis for scalable real-time communication. The @hocuspocus/extension-redis package integrates Redis as a message broker, allowing collaboration updates to be efficiently distributed across multiple server instances. This setup supports horizontal scaling of the collaboration service while maintaining low-latency synchronization.

The system includes several optimization extensions:
- **AuthenticationExtension**: Handles user authentication for collaboration sessions
- **ConnectionLimitExtension**: Manages connection limits to prevent abuse
- **PersistenceExtension**: Ensures document changes are persisted to the database
- **MetricsExtension**: Collects performance metrics for monitoring and optimization

**Section sources**
- [package.json](file://package.json#L200-L250)
- [server/index.ts](file://server/index.ts#L50-L100)
- [app/index.tsx](file://app/index.tsx#L50-L100)

## Testing Tools

The baozi application employs a comprehensive testing strategy using Jest for unit and integration testing, and Cypress for end-to-end testing. This multi-layered approach ensures code quality, functionality correctness, and user experience consistency across different scenarios.

Jest is configured as the primary testing framework, with separate configurations for different parts of the application. The test suite includes unit tests for individual components, integration tests for service interactions, and snapshot tests for UI components. The application uses babel-jest for TypeScript support and jest-environment-jsdom for browser-like testing environments. Mock implementations are provided for external dependencies like Redis and database connections to ensure test isolation.

Cypress provides end-to-end testing capabilities, simulating real user interactions with the application through the browser. The tests cover critical user journeys such as document creation, editing, sharing, and collaboration. Cypress recordings help identify UI issues and verify that complex workflows function as expected across different browsers and devices.

The testing infrastructure is integrated into the development workflow through lint-staged and husky, ensuring that tests are run before commits are made. The package.json defines scripts for running different test suites, including test:app for frontend tests, test:server for backend tests, and test:shared for shared utilities. Code coverage is monitored to maintain high test quality standards.

Additional testing utilities include:
- **jest-fetch-mock**: For mocking API calls in tests
- **ioredis-mock**: For testing Redis-dependent functionality
- **nodemon**: For automatically restarting tests during development
- **oxlint**: For static code analysis and linting

**Section sources**
- [package.json](file://package.json#L250-L300)
- [app/test/setup.ts](file://app/test/setup.ts#L1-L10)
- [server/test/setup.ts](file://server/test/setup.ts#L1-L10)

## Deployment Technologies

The baozi application is containerized using Docker and orchestrated with Docker Compose for simplified deployment and scaling. This infrastructure enables consistent environments across development, testing, and production, while facilitating easy deployment and maintenance.

The Dockerfile defines the application container based on the node:22.21.0-slim image, following security best practices by creating a non-root user for running the application. The build process copies the compiled application from the build directory, installs dependencies, and sets up the necessary file storage directory with appropriate permissions. The container exposes port 3000 and includes a health check that verifies server responsiveness through the /_health endpoint.

Docker Compose orchestrates the complete application stack, defining services for the application, PostgreSQL database, and Redis cache. The docker-compose.yml file configures the services with appropriate ports, environment variables, and user permissions. This setup allows developers to quickly spin up a complete development environment with all dependencies properly configured.

The deployment strategy supports both monolithic and microservices architectures through configurable service flags. The application can run multiple services (web, API, collaboration, worker) within the same process or distribute them across separate containers based on resource requirements and scaling needs. The throng library enables clustering of Node.js processes to utilize multiple CPU cores effectively.

Additional deployment considerations include:
- **Environment variables**: Configuration is managed through environment variables defined in .env files
- **Volume mounting**: Persistent data storage is handled through volume mounts for file attachments
- **Health checks**: Container health is monitored through HTTP endpoints
- **Logging**: Application logs are structured and can be integrated with monitoring systems

**Section sources**
- [Dockerfile](file://Dockerfile#L1-L54)
- [docker-compose.yml](file://docker-compose.yml#L1-L16)
- [package.json](file://package.json#L300-L350)