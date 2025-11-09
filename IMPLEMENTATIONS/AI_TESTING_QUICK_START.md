# AI Testing Quick Start Guide

Quick reference for running AI infrastructure tests.

## Model Context Windows

| Model | Name | Context Window | Usage |
|-------|------|----------------|-------|
| **Primary** | zai-glm-4.6 | **200k tokens** | AI Ask, AI Search, AI Generate, AI Summary |
| **Task** | qwen3-30b-a3b-instruct | **15k tokens** | Title generation, Summaries, Suggestions |
| **Fallback** | GLM-4.6 | **200k tokens** | Universal backup for both Primary and Task |

---

## Quick Commands

### Run All Tests
```bash
./scripts/test-ai-infrastructure.sh --all
```

### Run with Coverage
```bash
./scripts/test-ai-infrastructure.sh --all --coverage
```

### Run Specific Category
```bash
# Unit tests only
./scripts/test-ai-infrastructure.sh --unit

# Integration tests only
./scripts/test-ai-infrastructure.sh --integration

# Fallback mechanism tests
./scripts/test-ai-infrastructure.sh --fallback

# Task model tests
./scripts/test-ai-infrastructure.sh --task

# Performance benchmark tests
./scripts/test-ai-infrastructure.sh --benchmark
```

### Run Individual Test File
```bash
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts
yarn test server/routes/api/ai/__tests__/fallback.test.ts
yarn test server/routes/api/ai/__tests__/aiFeatures.integration.test.ts
yarn test server/routes/api/ai/__tests__/taskModel.test.ts
```

---

## Test Categories

### ✅ Model Configuration (`modelConfig.test.ts`)
- Environment variable configuration
- Team preferences (Primary/Task/Fallback)
- Model selection priority
- Backward compatibility

### ✅ Fallback Mechanism (`fallback.test.ts`)
- Rate limit handling (429)
- Context overflow (15k/200k limits)
- Service unavailable (500/503)
- Error detection and retry logic

### ✅ AI Features (`aiFeatures.integration.test.ts`)
- AI Ask (Primary model, 200k context)
- AI Search (Primary model, concise answers)
- AI Generate (Primary model, 3 modes)
- Permission filtering
- Large context handling

### ✅ Task Model (`taskModel.test.ts`)
- Title generation (max 100 chars)
- Transcript summaries (time-segments)
- AI Suggestions (editor)
- Archive suggestions (topics, classification)
- 15k token limit enforcement

### 📊 LLM Benchmarks (`llm.benchmark.test.ts`)
- Tokens per second (TPS) measurement
- Time to first token (TTFT)
- Total latency tracking
- Streaming performance metrics
- Primary vs Task model comparison
- Load testing and percentiles

### 🎯 Workflow Benchmarks (`workflow.benchmark.test.ts`)
- Audio transcription performance
- Title generation timing
- Segment summary generation
- Full document summary
- End-to-end workflow latency
- Throughput measurement (audio min/wall-clock min)

---

## Coverage Report

```bash
# Generate coverage report
./scripts/test-ai-infrastructure.sh --all --coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

---

## Expected Coverage

| Category | Target | Description |
|----------|--------|-------------|
| Overall | 90%+ | All AI infrastructure code |
| Model Config | 95%+ | Three-tier model selection |
| Fallback | 100% | All fallback scenarios |
| AI Features | 85%+ | Core AI functionality |
| Task Model | 90%+ | Lightweight operations |

---

## Common Test Scenarios

### Testing Primary Model (200k context)
```typescript
// Large context should use Primary model
const largeContent = generateLargeContent(50000); // 50k tokens
expect(fitsInContextWindow(largeContent, 'PRIMARY')).toBe(true);
```

### Testing Task Model (15k context)
```typescript
// Small context uses Task model
const smallContent = generateLargeContent(5000); // 5k tokens
expect(fitsInContextWindow(smallContent, 'TASK')).toBe(true);
```

### Testing Fallback
```typescript
// Rate limit triggers fallback
expect(assertions.shouldTriggerFallback(429, 'Rate limit exceeded')).toBe(true);

// Context overflow triggers fallback
expect(assertions.shouldTriggerFallback(400, 'context_length_exceeded')).toBe(true);
```

---

## Watch Mode

```bash
# Run tests in watch mode
./scripts/test-ai-infrastructure.sh --all --watch

# Press 'a' to run all tests
# Press 'p' to filter by filename
# Press 'q' to quit
```

---

## Debugging Tests

### Verbose Output
```bash
./scripts/test-ai-infrastructure.sh --all --verbose
```

### Run Single Test
```bash
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts -t "should have correct default model names"
```

### Debug with Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest server/routes/api/ai/__tests__/modelConfig.test.ts
```

---

## Test Data Generators

```typescript
import {
  generateLargeContent,
  generateSampleTranscript,
  generateSegmentedTranscript,
} from './testUtils';

// Generate large content
const text = generateLargeContent(50000); // 50k tokens

// Generate transcript
const transcript = generateSampleTranscript({
  duration: 600,
  speakers: ['Alice', 'Bob'],
  wordsPerMinute: 150,
});

// Generate segmented transcript
const segments = generateSegmentedTranscript({
  segments: 4,
  duration: 1200,
});
```

---

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run AI Tests
  run: ./scripts/test-ai-infrastructure.sh --all --coverage
```

### Pre-commit Hook
```bash
# .git/hooks/pre-commit
#!/bin/bash
./scripts/test-ai-infrastructure.sh --all
```

---

## Troubleshooting

### Tests timeout
```typescript
jest.setTimeout(10000); // Increase to 10s
```

### Missing environment variables
```bash
# Create .env.test
LLM_API_KEY=test-key
LLM_API_BASE_URL=https://test-api.com
```

### Database errors
```bash
yarn test:setup
```

---

## Performance Benchmarks

### Expected Performance Thresholds

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

### Benchmark Test Commands

```bash
# Run all benchmark tests
./scripts/test-ai-infrastructure.sh --benchmark

# Run individual benchmark files
yarn test server/routes/api/ai/__tests__/llm.benchmark.test.ts
yarn test server/routes/api/ai/__tests__/workflow.benchmark.test.ts

# Run with verbose output to see detailed metrics
./scripts/test-ai-infrastructure.sh --benchmark --verbose
```

### Baseline Audio File

The benchmark tests use `baseline.ogg` (5.7MB, ~5 minutes) for consistent performance testing:
- **Location**: `server/routes/api/ai/__tests__/fixtures/baseline.ogg`
- **Duration**: ~300 seconds (5 minutes)
- **Size**: 5.7MB
- **Format**: OGG/Vorbis audio

### Key Performance Metrics

**Tokens Per Second (TPS)**:
- Primary Model: ≥ 10 TPS
- Task Model: ≥ 20 TPS (faster for lightweight ops)

**Time to First Token (TTFT)**:
- Primary Model: ≤ 2 seconds
- Task Model: ≤ 1 second

**Transcription Real-Time Ratio**:
- Target: ≥ 10x real-time (5min audio in ≤30sec)

**End-to-End Workflow** (5min audio):
- Transcription: ~30s
- Title + Summaries: ~2s
- Total: ≤ 60s

---

## Resources

- 📖 **Full Test Documentation**: `AI_TEST_SUITE.md`
- 🏗️ **Architecture Guide**: `AI_INFRA_REDESIGN.md`
- 🔧 **Test Utilities**: `server/routes/api/ai/__tests__/testUtils.ts`
- 🚀 **Test Runner**: `scripts/test-ai-infrastructure.sh`

---

## Quick Checks

### Before Committing
```bash
# Run all tests
./scripts/test-ai-infrastructure.sh --all

# Check coverage
./scripts/test-ai-infrastructure.sh --all --coverage
```

### After Making Changes
```bash
# Run affected tests in watch mode
./scripts/test-ai-infrastructure.sh --unit --watch
```

---

## Getting Help

1. ✅ Check test documentation: `AI_TEST_SUITE.md`
2. ✅ Review test utilities: `testUtils.ts`
3. ✅ Look at existing tests for examples
4. ✅ Open issue with `[AI-TESTS]` tag
