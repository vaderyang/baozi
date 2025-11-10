# Implementation Plan

- [x] 1. Create database schema and models
  - Create migration for health_checks, service_metrics, and failed_requests tables
  - Implement HealthCheck Sequelize model with JSONB support for LLM models health
  - Implement ServiceMetric Sequelize model with support for multiple interval types
  - Implement FailedRequest Sequelize model with JSONB for request parameters
  - Add new TeamPreference enum values for retention settings (MonitoringRetention5Min, MonitoringRetention1Hour, MonitoringRetention1Day)
  - _Requirements: 1.10, 3.1-3.3, 4.1-4.3, 5.1-5.3, 6.1-6.8, 11.2-11.6, 12.3_

- [x] 2. Implement SystemMonitoringService
  - Create SystemMonitoringService class in server/services/
  - Implement recordLLMMetric() method with in-memory buffering
  - Implement recordTranscriptionMetric() method with in-memory buffering
  - Implement performHealthCheck() method that reuses existing health check logic
  - Implement getServiceMetrics() query method with filtering and aggregation
  - Implement getUserAnalytics() query method with per-user statistics
  - Implement getFailedRequests() query method with drill-down support
  - Implement cleanupOldMetrics() method for data retention
  - Implement aggregateMetrics() method for multi-level time bucketing (5min → 1hour → 1day)
  - Add metrics buffer with 30-second flush interval for batch inserts
  - _Requirements: 2.1-2.7, 3.1-3.5, 4.1-4.5, 5.1-5.6, 7.1-7.8, 9.1-9.7, 10.1-10.8, 12.1-12.7_

- [x] 3. Add metrics collection hooks to existing services
  - Add LLM metrics collection hook in AIArchiveSuggestionService
  - Add LLM metrics collection hook in AISummaryTask
  - Add transcription metrics collection hook in TranscriptionTask
  - Ensure metrics collection fails silently without impacting service performance
  - Record success/failure status, token counts, duration, and user context
  - _Requirements: 2.1-2.7, 7.1-7.8, 12.1-12.2, 12.6_

- [x] 4. Implement background tasks
  - Create HealthCheckTask that runs every 5 minutes
  - Implement health check execution for global and team-specific configurations
  - Create MetricsAggregationTask that runs every 5 minutes
  - Implement 5-minute interval aggregation logic
  - Implement hourly aggregation logic (triggered at minute 0)
  - Implement daily aggregation logic (triggered at midnight)
  - Create DataRetentionTask that runs every hour
  - Implement retention policy enforcement based on team preferences
  - Register all tasks in the task queue scheduler
  - _Requirements: 3.1-3.5, 4.1-4.5, 5.1-5.6, 6.7, 11.1-11.8, 12.4-12.5_

- [x] 5. Enhance health check API endpoint
  - Modify existing GET /api/health endpoint to store results in database
  - Add optional history parameter to return last 24 hours of health checks
  - Ensure backward compatibility with existing health check response format
  - Add health status trend calculation for selected time range
  - _Requirements: 1.1-1.10_

- [x] 6. Create monitoring API endpoints
  - Create GET /api/monitoring/metrics endpoint with query parameters
  - Implement automatic interval selection based on time range
  - Create GET /api/monitoring/users endpoint for user analytics
  - Create GET /api/monitoring/failures endpoint for failure drill-down
  - Add proper authentication and authorization (admin-only access)
  - Implement team isolation to ensure teams only see their own metrics
  - Add response pagination for large result sets
  - _Requirements: 9.1-9.7, 10.1-10.8, 13.1-13.7_

- [x] 7. Create settings API endpoint for retention configuration
  - Create PUT /api/settings/monitoring endpoint
  - Implement validation for retention period values (positive integers)
  - Store retention settings in team preferences JSONB field
  - Return updated settings in response
  - _Requirements: 6.1-6.8_

- [x] 8. Build monitoring dashboard frontend components
  - Create MonitoringDashboard scene at app/scenes/Settings/Monitoring.tsx
  - Implement HealthStatusPanel component with overall, database, LLM, and ASR status
  - Implement MetricsVisualization component with time-series charts using recharts
  - Add TimeRangeSelector component (24h, 7d, 30d, 1y options)
  - Add ServiceTypeSelector component (LLM, Transcription toggle)
  - Implement MetricsSummary component with key statistics
  - Implement UserAnalyticsTable component with sortable columns
  - Implement FailureDrillDown component with timeline and details modal
  - Add auto-refresh every 1 minute with manual refresh button
  - Add loading indicators and error handling
  - _Requirements: 1.1-1.10, 9.1-9.7, 10.1-10.8, 13.1-13.7_

- [x] 9. Create retention settings UI
  - Add monitoring retention configuration section to Settings/AI.tsx
  - Create input fields for 5-minute, 1-hour, and 1-day retention periods
  - Set default values (24 hours, 7 days, 365 days)
  - Implement form validation for positive integers
  - Add save functionality that calls PUT /api/settings/monitoring
  - Display current retention settings
  - _Requirements: 6.1-6.8_

- [x] 10. Add navigation and routing
  - Add "System Monitoring" menu item to Settings navigation and remove "System Health" menu item.
  - Create route for /settings/monitoring
  - Ensure admin-only access to monitoring dashboard
  - Add breadcrumb navigation
  - _Requirements: 13.1-13.7_

- [ ]* 11. Write integration tests
  - Test health check storage and retrieval
  - Test metrics collection and aggregation across all interval types
  - Test data retention cleanup with various retention settings
  - Test API endpoints with authentication and authorization
  - Test team isolation for metrics queries
  - Test metrics buffer flush and batch insert performance
  - _Requirements: All requirements_

- [ ]* 12. Write performance tests
  - Verify metrics collection overhead < 10ms per service call
  - Test concurrent metric recording (100+ requests/sec)
  - Verify dashboard load time < 3s for 24-hour metrics
  - Test data retention cleanup performance with 1M+ records
  - _Requirements: 12.6, 13.1_
