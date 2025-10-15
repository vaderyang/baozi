# Meeting AI Service Name Fix

## Issue
The Meeting AI WebSocket service failed to start with error:
```
Error: Unknown service meetingai
```

## Root Cause
Service names in Outline are automatically converted to lowercase in `server/env.ts:320`:
```typescript
.map((service) => service.toLowerCase().trim())
```

The Meeting AI service was originally exported as `meetingAI` (camelCase), but the environment variable parser converted it to `meetingai` (lowercase), causing a mismatch.

## Solution
Changed the service export name to lowercase to match the naming convention of other services (websockets, collaboration, admin, web, worker, cron).

## Files Changed

### server/services/index.ts
```typescript
// Before
import meetingAI from "./meetingAI";
export default {
  meetingAI,
  // ...
}

// After
import meetingai from "./meetingAI";
export default {
  meetingai,
  // ...
}
```

### .env.development
```bash
# Before
SERVICES=collaboration,websockets,worker,web,meetingAI

# After
SERVICES=collaboration,websockets,worker,web,meetingai
```

### package.json
```json
// Before
"dev": "... --services=cron,collaboration,websockets,admin,web,worker,meetingAI"

// After
"dev": "... --services=cron,collaboration,websockets,admin,web,worker,meetingai"
```

## Testing
After rebuilding the server (`yarn build:server`), the service should start without errors:
```
info: [lifecycle] Starting meetingai service
```

## Convention
All Outline services use lowercase names:
- `websockets`
- `collaboration`
- `admin`
- `web`
- `worker`
- `cron`
- `meetingai` ✓

This maintains consistency across the codebase.
