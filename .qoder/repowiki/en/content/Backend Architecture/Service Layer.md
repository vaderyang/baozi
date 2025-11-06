# Service Layer

<cite>
**Referenced Files in This Document**   
- [web.ts](file://server/services/web.ts)
- [collaboration.ts](file://server/services/collaboration.ts)
- [worker.ts](file://server/services/worker.ts)
- [cron.ts](file://server/services/cron.ts)
- [documentCreator.ts](file://server/commands/documentCreator.ts)
- [queue.ts](file://server/queues/queue.ts)
- [NotificationsProcessor.ts](file://server/queues/processors/NotificationsProcessor.ts)
- [ExportDocumentTreeTask.ts](file://server/queues/tasks/ExportDocumentTreeTask.ts)
- [CleanupExpiredAttachmentsTask.ts](file://server/queues/tasks/CleanupExpiredAttachmentsTask.ts)
- [commands/](file://server/commands/)
- [queues/processors/](file://server/queues/processors/)
- [queues/tasks/](file://server/queues/tasks/)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive architectural documentation for the baozi service layer. It describes the modular service architecture consisting of web, collaboration, worker, and cron services. The document explains the responsibilities of each service, their interaction patterns, and key implementation details including the command pattern for business operations, background job processing with Bull queues, real-time collaboration via WebSockets, and scheduled task execution. The analysis covers scalability, error handling, monitoring, and service coordination for common operations.

## Project Structure
The baozi service layer is organized into a modular architecture with distinct services handling specific responsibilities. The core services are located in the `server/services/` directory, with supporting components in `server/commands/`, `server/queues/`, and `server/collaboration/`. This structure enables separation of concerns while maintaining cohesive integration through well-defined interfaces and event-driven communication.

```mermaid
graph TD
subgraph "Service Layer"
Web[Web Service]
Collaboration[Collaboration Service]
Worker[Worker Service]
Cron[Cron Service]
end
subgraph "Supporting Components"
Commands[Commands]
Queues[Queues]
Processors[Processors]
Tasks[Tasks]
end
Web --> |HTTP Requests| Queues
Collaboration --> |WebSocket Events| Queues
Worker --> |Process Jobs| Queues
Cron --> |Schedule Tasks| Queues
Commands --> |Encapsulate Logic| Web
Commands --> |Encapsulate Logic| Worker
Processors --> |Handle Events| Worker
Tasks --> |Execute Async| Worker
style Web fill:#4CAF50,stroke:#388E3C
style Collaboration fill:#2196F3,stroke:#1976D2
style Worker fill:#FF9800,stroke:#F57C00
style Cron fill:#9C27B0,stroke:#7B1FA2
```

**Diagram sources**
- [web.ts](file://server/services/web.ts)
- [collaboration.ts](file://server/services/collaboration.ts)
- [worker.ts](file://server/services/worker.ts)
- [cron.ts](file://server/services/cron.ts)

**Section sources**
- [server/services/](file://server/services/)
- [server/commands/](file://server/commands/)
- [server/queues/](file://server/queues/)

## Core Components
The baozi service layer consists of four primary services: web, collaboration, worker, and cron. Each service has distinct responsibilities and operates as an independent process while sharing the same codebase and database. The web service handles HTTP requests and serves the application, the collaboration service manages real-time document editing through WebSockets, the worker service processes background jobs, and the cron service executes scheduled tasks. These services communicate through a shared Redis-backed queue system, enabling asynchronous processing and decoupled architecture.

**Section sources**
- [web.ts](file://server/services/web.ts)
- [collaboration.ts](file://server/services/collaboration.ts)
- [worker.ts](file://server/services/worker.ts)
- [cron.ts](file://server/services/cron.ts)

## Architecture Overview
The baozi service layer implements a microservices-inspired architecture with four specialized services that can be scaled independently based on workload requirements. The architecture follows a command-query responsibility segregation (CQRS) pattern where the web service handles synchronous requests while background processing is delegated to worker services through message queues. All services share access to the same database and Redis instances, ensuring data consistency while enabling horizontal scaling of stateless services.

```mermaid
graph LR
Client[Client Browser] --> |HTTP/HTTPS| WebService[Web Service]
Client --> |WebSocket| CollaborationService[Collaboration Service]
WebService --> |Publish Events| RedisQueue[(Redis Queue)]
CollaborationService --> |Publish Events| RedisQueue
CronService[Cron Service] --> |Schedule Tasks| RedisQueue
RedisQueue --> |Consume Jobs| WorkerService[Worker Service]
WorkerService --> |Update Database| Database[(PostgreSQL)]
WorkerService --> |Send Notifications| EmailService[Email Service]
WorkerService --> |Process Files| StorageService[Storage Service]
Database --> |Read Data| WebService
Database --> |Read Data| CollaborationService
Database --> |Read Data| WorkerService
style WebService fill:#4CAF50,stroke:#388E3C
style CollaborationService fill:#2196F3,stroke:#1976D2
style WorkerService fill:#FF9800,stroke:#F57C00
style CronService fill:#9C27B0,stroke:#7B1FA2
style RedisQueue fill:#FFEB3B,stroke:#FBC02D
style Database fill:#00BCD4,stroke:#0097A7
```

**Diagram sources**
- [web.ts](file://server/services/web.ts)
- [collaboration.ts](file://server/services/collaboration.ts)
- [worker.ts](file://server/services/worker.ts)
- [cron.ts](file://server/services/cron.ts)
- [queue.ts](file://server/queues/queue.ts)

## Detailed Component Analysis

### Web Service Analysis
The web service is responsible for handling HTTP requests, serving the application, and providing API endpoints. It is implemented as a Koa application that routes requests to appropriate handlers. The service includes middleware for security (CSP, CSRF protection), compression, and SSL enforcement. It serves static assets and mounts API, authentication, and OAuth routes. The web service also generates and attaches CSRF tokens to sessions for non-API requests.

```mermaid
flowchart TD
Start([HTTP Request]) --> Middleware["Apply Middleware\n(compression, CSP, CSRF)"]
Middleware --> Route{"Route Type?"}
Route --> |API| APIRoute["Route to /api endpoints"]
Route --> |Auth| AuthRoute["Route to /auth endpoints"]
Route --> |OAuth| OAuthRoute["Route to /oauth endpoints"]
Route --> |Other| AppRoute["Route to application"]
APIRoute --> Controller["API Controller"]
AuthRoute --> Controller
OAuthRoute --> Controller
AppRoute --> Controller
Controller --> DB["Database Operations"]
DB --> Response["HTTP Response"]
style Start fill:#E3F2FD,stroke:#2196F3
style Response fill:#E8F5E8,stroke:#4CAF50
style Middleware fill:#FFF3E0,stroke:#FF9800
style Route fill:#F3E5F5,stroke:#9C27B0
```

**Diagram sources**
- [web.ts](file://server/services/web.ts)

**Section sources**
- [web.ts](file://server/services/web.ts)

### Collaboration Service Analysis
The collaboration service manages real-time document editing through WebSocket connections using the Hocuspocus server. It handles document synchronization, presence tracking, and collaborative editing state. The service implements authentication, connection limiting, and persistence extensions to ensure secure and reliable real-time collaboration. WebSocket connections are upgraded from HTTP requests on the "/collaboration" path, with document ID extracted from the URL for routing to the appropriate document state.

```mermaid
sequenceDiagram
participant Client as "Client Browser"
participant Web as "Web Server"
participant Collaboration as "Collaboration Service"
participant Hocuspocus as "Hocuspocus Server"
participant Redis as "Redis (Collaboration)"
Client->>Web : WebSocket Upgrade Request
Web->>Web : Parse documentId from URL
Web->>Collaboration : Forward upgrade request
Collaboration->>Hocuspocus : Handle Connection(documentId)
Hocuspocus->>Hocuspocus : Initialize document state
Hocuspocus->>Redis : Load existing state
Hocuspocus->>Collaboration : Authentication check
Collaboration->>Hocuspocus : Authentication result
Hocuspocus->>Client : Connection established
loop Real-time Editing
Client->>Hocuspocus : Send document updates
Hocuspocus->>Redis : Persist updates
Hocuspocus->>Client : Broadcast updates to collaborators
end
```

**Diagram sources**
- [collaboration.ts](file://server/services/collaboration.ts)
- [collaboration/](file://server/collaboration/)

**Section sources**
- [collaboration.ts](file://server/services/collaboration.ts)
- [collaboration/](file://server/collaboration/)

### Worker Service Analysis
The worker service processes background jobs using Bull queues with Redis as the message broker. It handles three types of queues: global event queue for system events, processor event queue for event-specific processing, and task queue for asynchronous tasks. The worker service implements comprehensive error handling, retry mechanisms, and monitoring through health checks. Each job is processed with distributed tracing and metrics collection for observability.

```mermaid
flowchart TD
subgraph "Worker Service"
GlobalQueue[Global Event Queue]
ProcessorQueue[Processor Event Queue]
TaskQueue[Task Queue]
HealthMonitor[Health Monitor]
end
subgraph "Processors"
NotificationsProcessor[NotificationsProcessor]
EmailsProcessor[EmailsProcessor]
BacklinksProcessor[BacklinksProcessor]
end
subgraph "Tasks"
ExportTask[ExportDocumentTreeTask]
CleanupTask[CleanupExpiredAttachmentsTask]
TranscriptionTask[TranscriptionTask]
end
GlobalQueue --> |Filtered Events| ProcessorQueue
GlobalQueue --> |All Events| HealthMonitor
ProcessorQueue --> NotificationsProcessor
ProcessorQueue --> EmailsProcessor
ProcessorQueue --> BacklinksProcessor
TaskQueue --> ExportTask
TaskQueue --> CleanupTask
TaskQueue --> TranscriptionTask
NotificationsProcessor --> |Send Notifications| EmailService
EmailsProcessor --> |Send Emails| SMTP
BacklinksProcessor --> |Update Backlinks| Database
ExportTask --> |Generate Files| Storage
CleanupTask --> |Delete Expired| Storage
TranscriptionTask --> |Process Audio| AIModel
style GlobalQueue fill:#FFEB3B,stroke:#FBC02D
style ProcessorQueue fill:#FFEB3B,stroke:#FBC02D
style TaskQueue fill:#FFEB3B,stroke:#FBC02D
style HealthMonitor fill:#4CAF50,stroke:#388E3C
```

**Diagram sources**
- [worker.ts](file://server/services/worker.ts)
- [queues/](file://server/queues/)
- [queues/processors/](file://server/queues/processors/)
- [queues/tasks/](file://server/queues/tasks/)

**Section sources**
- [worker.ts](file://server/services/worker.ts)
- [queues/](file://server/queues/)
- [queues/processors/](file://server/queues/processors/)
- [queues/tasks/](file://server/queues/tasks/)

### Cron Service Analysis
The cron service executes scheduled tasks at predefined intervals (minute, hourly, daily). It scans the registered tasks and schedules those matching the current interval. The service uses setInterval to trigger task execution at the appropriate frequency. Tasks are scheduled through the Bull queue system, ensuring they are processed by available worker services. The cron service provides a scalable mechanism for periodic maintenance, cleanup, and reporting operations.

```mermaid
flowchart TD
Start([Service Start]) --> Init["Initialize Cron Service"]
Init --> Schedule["Set Interval Timers"]
subgraph "Interval Triggers"
MinuteTimer["Minute Timer (60s)"]
HourTimer["Hourly Timer (1h)"]
DayTimer["Daily Timer (24h)"]
end
Schedule --> MinuteTimer
Schedule --> HourTimer
Schedule --> DayTimer
MinuteTimer --> |Trigger| RunTasks["Run(TaskSchedule.Minute)"]
HourTimer --> |Trigger| RunTasks
DayTimer --> |Trigger| RunTasks
RunTasks --> Filter["Filter Tasks by cron schedule"]
Filter --> ScheduleTasks["Schedule matching tasks"]
ScheduleTasks --> Queue["Add to Bull Queue"]
Queue --> Worker["Worker Service Processes"]
style Start fill:#E3F2FD,stroke:#2196F3
style RunTasks fill:#FFEB3B,stroke:#FBC02D
style Queue fill:#FFEB3B,stroke:#FBC02D
style Worker fill:#FF9800,stroke:#F57C00
```

**Diagram sources**
- [cron.ts](file://server/services/cron.ts)
- [queues/tasks/](file://server/queues/tasks/)

**Section sources**
- [cron.ts](file://server/services/cron.ts)
- [queues/tasks/](file://server/queues/tasks/)

### Command Pattern Implementation
The command pattern is implemented in the `commands/` directory to encapsulate complex business operations. Each command is a standalone module that accepts parameters and executes a specific business operation with proper error handling and transaction management. Commands are used across services to ensure consistent business logic execution. The pattern promotes reusability, testability, and separation of concerns by isolating business logic from service-specific concerns.

```mermaid
classDiagram
class Command {
<<interface>>
+execute() : Promise<any>
}
class DocumentCreator {
+user : User
+ctx : APIContext
+title : string
+collectionId : string
+parentDocumentId : string
+template : boolean
+execute() : Promise<Document>
}
class TeamProvisioner {
+user : User
+name : string
+subdomain : string
+execute() : Promise<Team>
}
class UserInviter {
+inviter : User
+email : string
+role : string
+execute() : Promise<Membership>
}
Command <|-- DocumentCreator
Command <|-- TeamProvisioner
Command <|-- UserInviter
class Document {
+id : string
+title : string
+content : JSON
+collectionId : string
}
class User {
+id : string
+email : string
+name : string
}
class APIContext {
+transaction : Transaction
+ip : string
}
DocumentCreator --> Document : "creates"
DocumentCreator --> User : "uses"
DocumentCreator --> APIContext : "uses"
TeamProvisioner --> User : "uses"
UserInviter --> User : "invites"
```

**Diagram sources**
- [commands/documentCreator.ts](file://server/commands/documentCreator.ts)
- [commands/teamProvisioner.ts](file://server/commands/teamProvisioner.ts)
- [commands/userInviter.ts](file://server/commands/userInviter.ts)

**Section sources**
- [commands/](file://server/commands/)

### Background Job Processing System
The background job processing system uses Bull queues with Redis as the message broker to handle asynchronous tasks and event processing. The system consists of three main queues: global event queue for incoming events, processor event queue for filtered events, and task queue for scheduled and on-demand tasks. Each queue has configurable concurrency and retry policies. The system includes health monitoring to track queue metrics and ensure reliable processing.

```mermaid
flowchart TD
subgraph "Event Sources"
WebService[Web Service]
CollaborationService[Collaboration Service]
ExternalAPI[External APIs]
end
subgraph "Queue System"
GlobalQueue[Global Event Queue]
ProcessorQueue[Processor Event Queue]
TaskQueue[Task Queue]
Redis[(Redis)]
end
subgraph "Processing"
WorkerService[Worker Service]
Processors[Event Processors]
Tasks[Background Tasks]
end
WebService --> |Publish Events| GlobalQueue
CollaborationService --> |Publish Events| GlobalQueue
ExternalAPI --> |Webhooks| GlobalQueue
GlobalQueue --> |Filter Events| ProcessorQueue
GlobalQueue --> |Direct Tasks| TaskQueue
ProcessorQueue --> WorkerService
TaskQueue --> WorkerService
WorkerService --> Processors
WorkerService --> Tasks
Processors --> |Update Database| Database[(PostgreSQL)]
Tasks --> |Update Database| Database
Tasks --> |Send Emails| EmailService
Tasks --> |Process Files| StorageService
Database --> |Read Data| WebService
Database --> |Read Data| CollaborationService
Redis --> |Store Queue Data| GlobalQueue
Redis --> |Store Queue Data| ProcessorQueue
Redis --> |Store Queue Data| TaskQueue
style GlobalQueue fill:#FFEB3B,stroke:#FBC02D
style ProcessorQueue fill:#FFEB3B,stroke:#FBC02D
style TaskQueue fill:#FFEB3B,stroke:#FBC02D
style WorkerService fill:#FF9800,stroke:#F57C00
```

**Diagram sources**
- [worker.ts](file://server/services/worker.ts)
- [queues/](file://server/queues/)
- [queues/processors/](file://server/queues/processors/)
- [queues/tasks/](file://server/queues/tasks/)

**Section sources**
- [worker.ts](file://server/services/worker.ts)
- [queues/](file://server/queues/)
- [queues/processors/](file://server/queues/processors/)
- [queues/tasks/](file://server/queues/tasks/)

### Real-time Collaboration Service
The real-time collaboration service enables multiple users to edit documents simultaneously with low latency. It uses WebSockets to establish persistent connections between clients and the server. The service leverages the Hocuspocus framework for Operational Transformation (OT) to resolve concurrent edits and maintain document consistency. The architecture includes extensions for authentication, connection limiting, persistence, and metrics collection to ensure secure and reliable collaboration.

```mermaid
sequenceDiagram
participant Client1 as "Client 1"
participant Client2 as "Client 2"
participant Server as "Collaboration Server"
participant Redis as "Redis"
participant Database as "PostgreSQL"
Client1->>Server : Connect to /collaboration/doc-123
Server->>Server : Authenticate user
Server->>Redis : Load document state
Server->>Client1 : Send initial state
Client1->>Server : Send edit operation
Server->>Server : Apply OT algorithm
Server->>Redis : Persist updated state
Server->>Client1 : Confirm operation
Server->>Client2 : Broadcast operation
Client2->>Server : Acknowledge operation
Client2->>Client1 : Render updated content
Client2->>Server : Send concurrent edit
Server->>Server : Resolve conflicts with OT
Server->>Redis : Persist merged state
Server->>Client2 : Confirm operation
Server->>Client1 : Broadcast operation
Client1->>Client2 : Render updated content
Server->>Database : Periodic snapshot
```

**Diagram sources**
- [collaboration.ts](file://server/services/collaboration.ts)
- [collaboration/](file://server/collaboration/)

**Section sources**
- [collaboration.ts](file://server/services/collaboration.ts)
- [collaboration/](file://server/collaboration/)

### Service Coordination Examples
The baozi service layer demonstrates effective service coordination for common operations such as document creation and team provisioning. When a document is created, the web service validates input and delegates to the documentCreator command. Upon successful creation, an event is published to the global queue, triggering notifications, revision tracking, and other side effects through the worker service. Similarly, team provisioning involves coordinated actions across multiple services with proper error handling and rollback mechanisms.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Web as "Web Service"
participant Command as "DocumentCreator"
participant DB as "Database"
participant Queue as "Bull Queue"
participant Worker as "Worker Service"
participant Email as "Email Service"
Client->>Web : Create Document Request
Web->>Command : Execute with parameters
Command->>DB : Begin transaction
Command->>DB : Insert document record
DB-->>Command : Success
Command->>DB : Insert event record
DB-->>Command : Success
Command->>DB : Commit transaction
DB-->>Command : Committed
Command-->>Web : Return document
Web-->>Client : Document created
Command->>Queue : Publish 'documents.create' event
Queue->>Worker : Deliver event
Worker->>Worker : Filter applicable processors
Worker->>NotificationsProcessor : Process event
NotificationsProcessor->>Queue : Schedule notification task
Queue->>Worker : Deliver task
Worker->>Email : Send notification email
Email-->>Worker : Sent
```

**Diagram sources**
- [documentCreator.ts](file://server/commands/documentCreator.ts)
- [worker.ts](file://server/services/worker.ts)
- [NotificationsProcessor.ts](file://server/queues/processors/NotificationsProcessor.ts)

**Section sources**
- [commands/documentCreator.ts](file://server/commands/documentCreator.ts)
- [worker.ts](file://server/services/worker.ts)
- [queues/processors/NotificationsProcessor.ts](file://server/queues/processors/NotificationsProcessor.ts)

## Dependency Analysis
The baozi service layer components have well-defined dependencies that enable loose coupling and independent scaling. The web, collaboration, worker, and cron services share dependencies on the database, Redis, and common utilities, but communicate primarily through message queues rather than direct service-to-service calls. This architecture minimizes tight coupling while ensuring reliable communication through the durable Redis-backed queue system.

```mermaid
graph TD
WebService --> Database
WebService --> Redis
WebService --> SharedUtils
CollaborationService --> Database
CollaborationService --> Redis
CollaborationService --> SharedUtils
WorkerService --> Database
WorkerService --> Redis
WorkerService --> SharedUtils
CronService --> Database
CronService --> Redis
CronService --> SharedUtils
WebService --> |Publish Events| Redis
CollaborationService --> |Publish Events| Redis
CronService --> |Schedule Tasks| Redis
Redis --> |Deliver Jobs| WorkerService
Commands --> Database
Commands --> SharedUtils
Processors --> Database
Processors --> EmailService
Processors --> StorageService
Tasks --> Database
Tasks --> EmailService
Tasks --> StorageService
Tasks --> AIService
style WebService fill:#4CAF50,stroke:#388E3C
style CollaborationService fill:#2196F3,stroke:#1976D2
style WorkerService fill:#FF9800,stroke:#F57C00
style CronService fill:#9C27B0,stroke:#7B1FA2
style Database fill:#00BCD4,stroke:#0097A7
style Redis fill:#FFEB3B,stroke:#FBC02D
```

**Diagram sources**
- [web.ts](file://server/services/web.ts)
- [collaboration.ts](file://server/services/collaboration.ts)
- [worker.ts](file://server/services/worker.ts)
- [cron.ts](file://server/services/cron.ts)
- [commands/](file://server/commands/)
- [queues/](file://server/queues/)

**Section sources**
- [server/services/](file://server/services/)
- [server/commands/](file://server/commands/)
- [server/queues/](file://server/queues/)

## Performance Considerations
The baozi service layer incorporates several performance optimizations to handle high loads efficiently. The web service uses compression middleware to reduce response sizes and implements connection monitoring to track active connections. The worker service supports configurable concurrency levels for different queue types, allowing resource allocation based on workload characteristics. Redis is used extensively for caching, session storage, and queue persistence, providing low-latency data access. The architecture supports horizontal scaling of stateless services (web, worker) to handle increased load.

**Section sources**
- [web.ts](file://server/services/web.ts)
- [worker.ts](file://server/services/worker.ts)
- [queue.ts](file://server/queues/queue.ts)

## Troubleshooting Guide
The baozi service layer includes comprehensive monitoring and error handling mechanisms to facilitate troubleshooting. Each service logs key operations and errors with structured logging that includes contextual information. The worker service implements retry mechanisms with exponential backoff for transient failures. Health monitors track queue metrics and system performance. Distributed tracing provides visibility into request flows across services. When troubleshooting issues, examine service logs, queue metrics, and database performance metrics to identify bottlenecks or failures.

**Section sources**
- [logging/](file://server/logging/)
- [worker.ts](file://server/services/worker.ts)
- [HealthMonitor.ts](file://server/queues/HealthMonitor.ts)
- [tracer.ts](file://server/logging/tracer.ts)

## Conclusion
The baozi service layer implements a robust, scalable architecture with well-defined separation of concerns between web, collaboration, worker, and cron services. The modular design enables independent scaling and maintenance of each component while maintaining cohesive integration through message queues and shared data stores. The command pattern ensures consistent business logic execution, while the background job processing system handles asynchronous operations reliably. The real-time collaboration service provides seamless multi-user editing capabilities, and the cron service enables scheduled maintenance tasks. This architecture balances performance, reliability, and maintainability, providing a solid foundation for the baozi application.