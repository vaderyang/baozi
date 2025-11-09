# System Monitoring Feature - Design Document

## Overview

The System Monitoring Feature enhances the existing health check system by adding comprehensive metrics collection, storage, and visualization capabilities. The feature maintains backward compatibility with the current health check API while introducing new endpoints and background tasks for metrics aggregation and historical data retention.

**Key Design Principles:**
- **Non-intrusive**: Metrics collection should not impact service performance
- **Scalable**: Support high-volume metric collection with efficient aggregation
- **Flexible retention**: Configurable data retention policies for different time granularities
- **Real-time + Historical**: Balance immediate visibility with long-term trend analysis
- **Minimal dependencies**: Leverage existing infrastructure (Bull queues, Sequelize ORM)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Monitoring Dashboard (React Component)            │  │
│  │  - Health Status Display                                  │  │
│  │  - Metrics Visualization (Charts)                         │  │
│  │  - User Analytics Table                                   │  │
│  │  - Failure Drill-Down                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Health Check    │  │  Metrics Query   │  │  Settings    │ │
│  │  Endpoint        │  │  Endpoints       │  │  Endpoint    │ │
│  │  (existing)      │  │  (new)           │  │  (enhanced)  │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           SystemMonitoringService                         │  │
│  │  - Metrics Collection                                     │  │
│  │  - Metrics Aggregation                                    │  │
│  │  - Health Check Execution                                 │  │
│  │  - Data Retention Management                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Background Tasks (Bull)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Health Check    │  │  Metrics         │  │  Data        │ │
│  │  Task            │  │  Aggregation     │  │  Retention   │ │
│  │  (every 5 min)   │  │  Task            │  │  Task        │ │
│  │                  │  │  (every 5 min)   │  │  (hourly)    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer (PostgreSQL)                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  health_checks   │  │  service_metrics │  │  failed_     │ │
│  │  (new table)     │  │  (new table)     │  │  requests    │ │
│  │                  │  │                  │  │  (new table) │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**1. Metrics Collection Flow:**
```
Service Call → Metrics Hook → In-Memory Buffer → Aggregation Task → Database
```

**2. Health Check Flow:**
```
Background Task → Service Checks → Database Storage → API Response
```

**3. Dashboard Query Flow:**
```
Dashboard → API Request → Service Query → Database → Aggregated Response
```

## Components and Interfaces

### 1. Database Models

#### HealthCheck Model
Stores periodic health check results for all services.

```typescript
interface HealthCheck {
  id: string;
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  
  // Database health
  databaseStatus: 'healthy' | 'unhealthy' | 'unknown';
  databaseResponseTime: number | null;
  databaseError: string | null;
  
  // LLM models health (JSON array)
  llmModelsHealth: Array<{
    modelName: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    responseTime: number | null;
    error: string | null;
    roles: string[];
    source: 'team' | 'environment';
    endpoint: string | null;
  }>;
  
  // ASR health
  asrStatus: 'healthy' | 'unhealthy' | 'unknown';
  asrResponseTime: number | null;
  asrError: string | null;
  asrEndpoint: string | null;
  
  teamId: string | null; // For team-specific checks
  
  createdAt: Date;
}
```

**Design Rationale:** Store complete health check snapshots to enable historical trend analysis. Using JSONB for LLM models allows flexible storage of varying model configurations without schema changes.

#### ServiceMetric Model
Stores aggregated metrics for LLM and transcription services.

```typescript
interface ServiceMetric {
  id: string;
  timestamp: Date;
  intervalType: '5min' | '1hour' | '1day';
  serviceType: 'llm' | 'transcription';
  
  // LLM-specific fields
  modelName: string | null;
  tokensPerSecond: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  
  // Transcription-specific fields
  averageAudioLength: number | null; // seconds
  averageTranscriptLength: number | null; // characters
  transcriptionSpeed: number | null; // audio minutes per second
  
  // Common fields
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number; // percentage
  
  // Queue metrics (optional)
  maxQueueDepth: number | null;
  averageQueueDepth: number | null;
  averageWaitTime: number | null; // seconds
  
  teamId: string | null;
  createdAt: Date;
}
```

**Design Rationale:** Single table for all service metrics with nullable fields allows efficient querying and indexing. The `intervalType` field enables multi-granularity storage without separate tables.

#### FailedRequest Model
Stores detailed information about failed service requests for debugging.

```typescript
interface FailedRequest {
  id: string;
  timestamp: Date;
  serviceType: 'llm' | 'transcription';
  
  // LLM-specific
  modelName: string | null;
  
  // Request details
  userId: string;
  username: string; // denormalized for performance
  errorMessage: string;
  errorCode: string | null;
  requestParameters: object; // JSONB
  
  // Context
  teamId: string;
  
  createdAt: Date;
}
```

**Design Rationale:** Separate table for failures enables efficient drill-down queries without impacting metrics aggregation performance. Denormalized username avoids joins in the dashboard.

### 2. Service Layer

#### SystemMonitoringService

**Purpose:** Central service for all monitoring operations including metrics collection, aggregation, and health checks.

```typescript
class SystemMonitoringService {
  // Metrics Collection
  async recordLLMMetric(params: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    success: boolean;
    userId: string;
    teamId: string;
    error?: string;
  }): Promise<void>;
  
  async recordTranscriptionMetric(params: {
    audioLengthSeconds: number;
    transcriptLength: number;
    durationMs: number;
    success: boolean;
    userId: string;
    teamId: string;
    error?: string;
  }): Promise<void>;
  
  // Metrics Aggregation
  async aggregateMetrics(
    intervalType: '5min' | '1hour' | '1day'
  ): Promise<void>;
  
  // Health Checks
  async performHealthCheck(teamId?: string): Promise<HealthCheckResult>;
  
  // Metrics Queries
  async getServiceMetrics(params: {
    serviceType: 'llm' | 'transcription';
    intervalType: '5min' | '1hour' | '1day';
    startTime: Date;
    endTime: Date;
    modelName?: string;
    teamId?: string;
  }): Promise<ServiceMetric[]>;
  
  async getUserAnalytics(params: {
    startTime: Date;
    endTime: Date;
    teamId: string;
  }): Promise<UserAnalytics[]>;
  
  async getFailedRequests(params: {
    serviceType: 'llm' | 'transcription';
    startTime: Date;
    endTime: Date;
    teamId: string;
    limit?: number;
  }): Promise<FailedRequest[]>;
  
  // Data Retention
  async cleanupOldMetrics(): Promise<void>;
}
```

**Design Rationale:** Service layer abstracts database operations and provides a clean interface for both API routes and background tasks. Async methods support non-blocking operations.

### 3. Background Tasks

#### HealthCheckTask
**Schedule:** Every 5 minutes  
**Purpose:** Execute health checks and store results

```typescript
class HealthCheckTask {
  async perform(): Promise<void> {
    // For each team with custom LLM/ASR config
    const teams = await Team.findAll({
      where: {
        preferences: {
          [Op.or]: [
            { [TeamPreference.AiGenerateTextModel]: { [Op.ne]: null } },
            { [TeamPreference.TranscriptionEndpoint]: { [Op.ne]: null } }
          ]
        }
      }
    });
    
    // Perform global health check
    await performAndStoreHealthCheck(null);
    
    // Perform team-specific health checks
    for (const team of teams) {
      await performAndStoreHealthCheck(team.id);
    }
  }
}
```

**Design Rationale:** Separate health checks for teams with custom configurations ensures accurate monitoring of team-specific services.

#### MetricsAggregationTask
**Schedule:** Every 5 minutes  
**Purpose:** Aggregate raw metrics into time-bucketed summaries

```typescript
class MetricsAggregationTask {
  async perform(): Promise<void> {
    const now = new Date();
    
    // Aggregate 5-minute intervals
    await aggregateInterval('5min', now);
    
    // Every hour, aggregate into 1-hour intervals
    if (now.getMinutes() === 0) {
      await aggregateInterval('1hour', now);
    }
    
    // Every day at midnight, aggregate into 1-day intervals
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      await aggregateInterval('1day', now);
    }
  }
}
```

**Design Rationale:** Single task handles all aggregation levels, reducing scheduler complexity. Time-based conditionals ensure efficient resource usage.

#### DataRetentionTask
**Schedule:** Every hour  
**Purpose:** Remove old metrics based on retention policy

```typescript
class DataRetentionTask {
  async perform(): Promise<void> {
    const settings = await getRetentionSettings();
    
    // Clean up 5-minute intervals
    await ServiceMetric.destroy({
      where: {
        intervalType: '5min',
        createdAt: {
          [Op.lt]: subHours(new Date(), settings.fiveMinuteRetentionHours)
        }
      }
    });
    
    // Clean up 1-hour intervals
    await ServiceMetric.destroy({
      where: {
        intervalType: '1hour',
        createdAt: {
          [Op.lt]: subDays(new Date(), settings.oneHourRetentionDays)
        }
      }
    });
    
    // Clean up 1-day intervals
    await ServiceMetric.destroy({
      where: {
        intervalType: '1day',
        createdAt: {
          [Op.lt]: subDays(new Date(), settings.oneDayRetentionDays)
        }
      }
    });
    
    // Clean up old health checks
    await HealthCheck.destroy({
      where: {
        createdAt: {
          [Op.lt]: subDays(new Date(), settings.oneDayRetentionDays)
        }
      }
    });
    
    // Clean up old failed requests
    await FailedRequest.destroy({
      where: {
        createdAt: {
          [Op.lt]: subDays(new Date(), settings.oneHourRetentionDays)
        }
      }
    });
  }
}
```

**Design Rationale:** Hourly cleanup is sufficient for retention management. Using database-level deletion is more efficient than application-level iteration.

### 4. API Endpoints

#### GET /api/monitoring/health
**Purpose:** Get current health status (enhanced existing endpoint)

**Response:**
```typescript
{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceHealth;
    llmModels: ModelHealth[];
    asr: ServiceHealth;
  };
  history?: HealthCheck[]; // Optional: last 24 hours
}
```

#### GET /api/monitoring/metrics
**Purpose:** Query service metrics

**Query Parameters:**
- `serviceType`: 'llm' | 'transcription'
- `intervalType`: '5min' | '1hour' | '1day'
- `startTime`: ISO timestamp
- `endTime`: ISO timestamp
- `modelName`: (optional) filter by model
- `teamId`: (optional) filter by team

**Response:**
```typescript
{
  data: ServiceMetric[];
  summary: {
    totalRequests: number;
    averageSuccessRate: number;
    averageTPS?: number;
  };
}
```

#### GET /api/monitoring/users
**Purpose:** Get user analytics

**Query Parameters:**
- `startTime`: ISO timestamp
- `endTime`: ISO timestamp
- `teamId`: team ID

**Response:**
```typescript
{
  data: Array<{
    userId: string;
    username: string;
    totalTranscriptionSeconds: number;
    totalTranscriptionRequests: number;
    totalTranscriptCharacters: number;
    totalLLMInputTokens: number;
    totalLLMOutputTokens: number;
  }>;
}
```

#### GET /api/monitoring/failures
**Purpose:** Get failed request details

**Query Parameters:**
- `serviceType`: 'llm' | 'transcription'
- `startTime`: ISO timestamp
- `endTime`: ISO timestamp
- `teamId`: team ID
- `limit`: (optional) max results

**Response:**
```typescript
{
  data: FailedRequest[];
  total: number;
}
```

#### PUT /api/settings/monitoring
**Purpose:** Update retention settings

**Request Body:**
```typescript
{
  fiveMinuteRetentionHours: number;
  oneHourRetentionDays: number;
  oneDayRetentionDays: number;
}
```

### 5. Frontend Components

#### MonitoringDashboard
**Location:** `app/scenes/Settings/Monitoring.tsx`

**Structure:**
```
MonitoringDashboard
├── HealthStatusPanel
│   ├── OverallStatus
│   ├── DatabaseStatus
│   ├── LLMModelsStatus
│   └── ASRStatus
├── MetricsVisualization
│   ├── TimeRangeSelector
│   ├── ServiceTypeSelector
│   ├── MetricsChart (using recharts)
│   └── MetricsSummary
├── UserAnalyticsTable
│   ├── SortableColumns
│   └── PaginatedRows
└── FailureDrillDown
    ├── FailureTimeline
    └── FailureDetailsModal
```

**Design Rationale:** Modular component structure allows independent updates and testing. Using existing UI library (recharts) maintains consistency with other dashboard features.

## Data Models

### Database Schema

```sql
-- Health checks table
CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP NOT NULL,
  overall_status VARCHAR(20) NOT NULL,
  
  database_status VARCHAR(20) NOT NULL,
  database_response_time INTEGER,
  database_error TEXT,
  
  llm_models_health JSONB NOT NULL,
  
  asr_status VARCHAR(20) NOT NULL,
  asr_response_time INTEGER,
  asr_error TEXT,
  asr_endpoint TEXT,
  
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_checks_timestamp ON health_checks(timestamp DESC);
CREATE INDEX idx_health_checks_team_timestamp ON health_checks(team_id, timestamp DESC);

-- Service metrics table
CREATE TABLE service_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP NOT NULL,
  interval_type VARCHAR(10) NOT NULL, -- '5min', '1hour', '1day'
  service_type VARCHAR(20) NOT NULL, -- 'llm', 'transcription'
  
  model_name VARCHAR(255),
  tokens_per_second DECIMAL(10, 2),
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  
  average_audio_length DECIMAL(10, 2),
  average_transcript_length INTEGER,
  transcription_speed DECIMAL(10, 4),
  
  total_requests INTEGER NOT NULL,
  successful_requests INTEGER NOT NULL,
  failed_requests INTEGER NOT NULL,
  success_rate DECIMAL(5, 2) NOT NULL,
  
  max_queue_depth INTEGER,
  average_queue_depth DECIMAL(10, 2),
  average_wait_time DECIMAL(10, 2),
  
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_metrics_lookup ON service_metrics(
  service_type, interval_type, timestamp DESC
);
CREATE INDEX idx_service_metrics_model ON service_metrics(
  model_name, timestamp DESC
) WHERE model_name IS NOT NULL;
CREATE INDEX idx_service_metrics_team ON service_metrics(
  team_id, timestamp DESC
) WHERE team_id IS NOT NULL;

-- Failed requests table
CREATE TABLE failed_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP NOT NULL,
  service_type VARCHAR(20) NOT NULL,
  
  model_name VARCHAR(255),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL,
  error_message TEXT NOT NULL,
  error_code VARCHAR(100),
  request_parameters JSONB,
  
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failed_requests_lookup ON failed_requests(
  service_type, timestamp DESC
);
CREATE INDEX idx_failed_requests_team ON failed_requests(
  team_id, timestamp DESC
);
CREATE INDEX idx_failed_requests_user ON failed_requests(
  user_id, timestamp DESC
);
```

### Retention Settings Storage

Retention settings will be stored in the existing `teams` table preferences JSONB field:

```typescript
interface TeamPreferences {
  // ... existing preferences
  [TeamPreference.MonitoringRetention5Min]: number; // hours, default 24
  [TeamPreference.MonitoringRetention1Hour]: number; // days, default 7
  [TeamPreference.MonitoringRetention1Day]: number; // days, default 365
}
```

**Design Rationale:** Using existing preferences structure avoids new tables and leverages existing settings UI patterns.

## Error Handling

### Metrics Collection Errors

**Strategy:** Fail silently to avoid impacting service performance

```typescript
async recordLLMMetric(params) {
  try {
    // Record metric
  } catch (error) {
    Logger.error('Failed to record LLM metric', error, {
      modelName: params.modelName,
      userId: params.userId
    });
    // Do not throw - metrics collection should never break service calls
  }
}
```

### Health Check Errors

**Strategy:** Record error state and continue

```typescript
async checkLLMModel(modelName) {
  try {
    // Perform check
  } catch (error) {
    return {
      modelName,
      status: 'unhealthy',
      error: error.message
    };
  }
}
```

### Dashboard Query Errors

**Strategy:** Return partial data with error indicators

```typescript
async getServiceMetrics(params) {
  try {
    return await ServiceMetric.findAll(/* ... */);
  } catch (error) {
    Logger.error('Failed to query service metrics', error);
    throw new ValidationError('Unable to load metrics data');
  }
}
```

## Testing Strategy

### Unit Tests

**Service Layer:**
- `SystemMonitoringService.recordLLMMetric()` - verify metric recording
- `SystemMonitoringService.aggregateMetrics()` - verify aggregation logic
- `SystemMonitoringService.cleanupOldMetrics()` - verify retention logic

**Models:**
- `HealthCheck.create()` - verify data validation
- `ServiceMetric.findAll()` - verify query filters
- `FailedRequest.create()` - verify error recording

### Integration Tests

**API Endpoints:**
- `GET /api/monitoring/health` - verify health check response
- `GET /api/monitoring/metrics` - verify metrics query with filters
- `GET /api/monitoring/users` - verify user analytics aggregation
- `GET /api/monitoring/failures` - verify failure drill-down

**Background Tasks:**
- `HealthCheckTask` - verify periodic execution and storage
- `MetricsAggregationTask` - verify multi-level aggregation
- `DataRetentionTask` - verify old data cleanup

### Performance Tests

**Metrics Collection:**
- Verify < 10ms overhead per service call
- Test concurrent metric recording (100+ requests/sec)

**Dashboard Queries:**
- Verify < 3s load time for 24-hour metrics
- Test pagination for large result sets

**Data Retention:**
- Verify cleanup completes within 5 minutes for 1M+ records

## Performance Considerations

### Metrics Collection

**Challenge:** High-frequency metric recording could impact database performance

**Solution:** In-memory buffering with periodic batch inserts

```typescript
class MetricsBuffer {
  private buffer: Map<string, MetricData[]> = new Map();
  private flushInterval = 30 * 1000; // 30 seconds
  
  add(metric: MetricData) {
    const key = `${metric.serviceType}:${metric.timestamp}`;
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }
    this.buffer.get(key)!.push(metric);
  }
  
  async flush() {
    const entries = Array.from(this.buffer.entries());
    this.buffer.clear();
    
    // Batch insert
    await ServiceMetric.bulkCreate(
      entries.flatMap(([_, metrics]) => metrics)
    );
  }
}
```

**Design Rationale:** Reduces database writes by 90%+ while maintaining near-real-time visibility (30s delay acceptable for monitoring).

### Query Optimization

**Challenge:** Large time ranges could result in slow queries

**Solution:** Automatic interval selection based on time range

```typescript
function selectOptimalInterval(startTime: Date, endTime: Date): IntervalType {
  const hours = differenceInHours(endTime, startTime);
  
  if (hours <= 24) return '5min';
  if (hours <= 168) return '1hour'; // 7 days
  return '1day';
}
```

**Design Rationale:** Limits result set size while maintaining appropriate granularity for the selected time range.

### Database Indexing

**Strategy:** Composite indexes for common query patterns

```sql
-- Optimizes: "Get LLM metrics for last 24 hours"
CREATE INDEX idx_service_metrics_llm_recent ON service_metrics(
  timestamp DESC
) WHERE service_type = 'llm' AND interval_type = '5min';

-- Optimizes: "Get metrics for specific model"
CREATE INDEX idx_service_metrics_model_time ON service_metrics(
  model_name, timestamp DESC
) WHERE model_name IS NOT NULL;
```

**Design Rationale:** Targeted indexes for specific query patterns avoid full table scans while minimizing index maintenance overhead.

## Security Considerations

### Access Control

**Requirement:** Only administrators should access monitoring dashboard

**Implementation:**
```typescript
router.get('monitoring.metrics', auth({ admin: true }), async (ctx) => {
  // Only admins can access
});
```

### Data Privacy

**Requirement:** Failed request parameters may contain sensitive data

**Implementation:**
```typescript
function sanitizeRequestParameters(params: any): any {
  return {
    ...params,
    // Remove potentially sensitive fields
    apiKey: '[REDACTED]',
    password: '[REDACTED]',
    token: '[REDACTED]'
  };
}
```

### Team Isolation

**Requirement:** Teams should only see their own metrics

**Implementation:**
```typescript
async getServiceMetrics(params) {
  const { teamId, user } = params;
  
  // Verify user has access to team
  if (user.teamId !== teamId && !user.isAdmin) {
    throw new AuthorizationError();
  }
  
  return ServiceMetric.findAll({
    where: { teamId }
  });
}
```

## Migration Strategy

### Phase 1: Database Schema
1. Create new tables (health_checks, service_metrics, failed_requests)
2. Add indexes
3. Add retention preferences to TeamPreference enum

### Phase 2: Service Layer
1. Implement SystemMonitoringService
2. Add metrics collection hooks to existing LLM/transcription services
3. Implement background tasks

### Phase 3: API Layer
1. Enhance existing health check endpoint
2. Add new metrics query endpoints
3. Add settings endpoint for retention configuration

### Phase 4: Frontend
1. Create monitoring dashboard components
2. Integrate with existing settings UI
3. Add navigation menu item

### Phase 5: Testing & Rollout
1. Run integration tests
2. Deploy to staging environment
3. Monitor performance impact
4. Gradual rollout to production

**Design Rationale:** Phased approach allows validation at each step and minimizes risk of breaking existing functionality.

## Open Questions & Future Enhancements

### Open Questions
1. Should queue metrics be collected for all queues or only LLM/transcription queues?
2. Should we support exporting metrics data (CSV, JSON)?
3. Should we add alerting capabilities (email/Slack notifications on failures)?

### Future Enhancements
1. **Real-time Streaming:** WebSocket-based live metrics updates
2. **Anomaly Detection:** ML-based detection of unusual patterns
3. **Cost Tracking:** Token usage cost calculation based on model pricing
4. **Comparative Analysis:** Compare metrics across teams or time periods
5. **Custom Dashboards:** User-configurable metric visualizations
6. **API Rate Limiting:** Track and enforce rate limits per user/team

## Dependencies

### New Dependencies
- None (uses existing infrastructure)

### Existing Dependencies
- **Bull:** Background task scheduling
- **Sequelize:** ORM for database operations
- **PostgreSQL:** Data storage
- **React:** Frontend framework
- **Recharts:** Chart visualization library (already in use)

**Design Rationale:** Minimizing new dependencies reduces maintenance burden and security surface area.
