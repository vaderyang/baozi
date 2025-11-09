# AI Infrastructure Test Suite

Comprehensive test suite for the three-tier AI model system covering all AI-powered features, model configuration, fallback mechanisms, and Task model operations.

## Model Context Windows

- **Primary Model** (`zai-glm-4.6`): **200k tokens**
- **Task Model** (`qwen3-30b-a3b-instruct`): **15k tokens**
- **Fallback Model** (`GLM-4.6`): **200k tokens**

---

## Test Coverage

### 1. Model Configuration Tests (`modelConfig.test.ts`)

**Coverage**: 95%+ of model selection logic

**Test Categories**:

- **Environment Variable Configuration**
  - ✅ Default model names (Primary/Task/Fallback)
  - ✅ Model context windows (200k/15k/200k)
  - ✅ Environment variable aliases
  - ✅ Backward compatibility

- **Team Preference Configuration**
  - ✅ `AiTaskModel` preference
  - ✅ `AiFallbackModel` preference
  - ✅ `AiGenerateTextModel` (Primary)
  - ✅ `AiSearchModel` (Primary)
  - ✅ Independent tier configuration

- **Model Selection Priority**
  - ✅ Team preference > Environment variable
  - ✅ Fallback to environment defaults
  - ✅ Purpose-based selection (primary/task)

- **Model Purpose Mapping**
  - ✅ Primary model → heavy-duty tasks
  - ✅ Task model → lightweight operations
  - ✅ Fallback model → universal backup

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts
```

---

### 2. Fallback Mechanism Tests (`fallback.test.ts`)

**Coverage**: 100% of fallback scenarios

**Test Categories**:

- **Rate Limit Fallback**
  - ✅ 429 status code detection
  - ✅ "rate limit" message detection
  - ✅ "too many requests" detection
  - ✅ Retry with fallback model

- **Context Window Overflow**
  - ✅ `context_length_exceeded` detection
  - ✅ Task model 15k limit handling
  - ✅ Primary model 200k limit handling
  - ✅ Fallback to larger model

- **Service Unavailable Fallback**
  - ✅ 503 status code
  - ✅ 500 internal error
  - ✅ "service unavailable" messages
  - ✅ "no server is available" detection

- **Non-Retriable Errors**
  - ✅ 401/403 auth errors (no retry)
  - ✅ 404 not found (no retry)
  - ✅ 400 invalid request (no retry unless context)

- **Fallback Flow**
  - ✅ Primary → Fallback flow
  - ✅ Task → Fallback flow
  - ✅ Both fail scenario
  - ✅ Logging and monitoring

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/fallback.test.ts
```

---

### 3. AI Features Integration Tests (`aiFeatures.integration.test.ts`)

**Coverage**: All AI-powered features

**Test Categories**:

- **AI Ask (Primary Model)**
  - ✅ Basic functionality
  - ✅ Multi-turn conversations
  - ✅ Permission filtering
  - ✅ Large context handling (200k)
  - ✅ `maxDocuments` parameter
  - ✅ `collectionId` filter
  - ✅ Error handling

- **AI Search (Primary Model)**
  - ✅ Basic search functionality
  - ✅ Concise answers (max 150 words)
  - ✅ Language parameter support
  - ✅ SSE streaming

- **AI Generate (Primary Model)**
  - ✅ Fast mode
  - ✅ Sensitive mode
  - ✅ Vision mode
  - ✅ Document mentions
  - ✅ Context handling

- **Performance**
  - ✅ Concurrent requests
  - ✅ Response times
  - ✅ Resource usage

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/aiFeatures.integration.test.ts
```

---

### 4. Task Model Tests (`taskModel.test.ts`)

**Coverage**: All Task model operations

**Test Categories**:

- **Title Generation**
  - ✅ Uses Task model (qwen3-30b-a3b-instruct)
  - ✅ Max 100 character titles
  - ✅ Short transcript handling
  - ✅ Grammar and formatting

- **Transcript Summaries**
  - ✅ Time-segment summaries
  - ✅ Speaker-aware summaries
  - ✅ Concise summaries (max 200 chars)
  - ✅ 5-minute segment processing

- **AI Suggestions**
  - ✅ Editor suggestions
  - ✅ Quick operations
  - ✅ Selection context handling
  - ✅ Multiple suggestion types

- **Archive Suggestions**
  - ✅ Topic extraction (max 5 topics)
  - ✅ Document type classification
  - ✅ Confidence scores
  - ✅ Collection suggestions

- **Context Window Management**
  - ✅ 15k token limit compliance
  - ✅ Fallback on overflow
  - ✅ Batch processing efficiency

- **Quality Assurance**
  - ✅ Grammatical correctness
  - ✅ Coherent summaries
  - ✅ Relevant topic extraction

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/taskModel.test.ts
```

---

### 5. LLM Performance Benchmarks (`llm.benchmark.test.ts`)

**Coverage**: Performance metrics for all LLM operations

**Test Categories**:

- **Primary Model Performance (zai-glm-4.6)**
  - ✅ AI Ask latency (max 10s)
  - ✅ AI Search latency (max 10s)
  - ✅ AI Generate latency (max 10s)
  - ✅ Large context handling (50k tokens)
  - ✅ Streaming performance (TTFT < 2s)

- **Task Model Performance (qwen3-30b-a3b-instruct)**
  - ✅ Title generation latency (max 3s)
  - ✅ Segment summary latency (max 3s)
  - ✅ AI Suggestion latency (max 3s)
  - ✅ Maximum context handling (15k tokens)
  - ✅ Better TPS than Primary for small contexts

- **Tokens Per Second (TPS) Metrics**
  - ✅ Primary model: ≥ 10 TPS
  - ✅ Task model: ≥ 20 TPS
  - ✅ TPS consistency under load
  - ✅ TPS by response size

- **Comparative Benchmarks**
  - ✅ Primary vs Task model comparison
  - ✅ Fallback performance impact
  - ✅ Latency percentiles (p50, p95, p99)

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/llm.benchmark.test.ts
```

---

### 6. Workflow Performance Benchmarks (`workflow.benchmark.test.ts`)

**Coverage**: End-to-end workflow performance with baseline audio

**Test Categories**:

- **Transcription Performance**
  - ✅ Real-time ratio (≥ 10x, 5min audio in ≤30s)
  - ✅ Latency per minute of audio (≤ 5s/min)
  - ✅ File size handling efficiency

- **Title Generation Workflow**
  - ✅ From baseline transcript (< 3s)
  - ✅ Token limit compliance (< 50 tokens)

- **Segment Summary Workflow**
  - ✅ 5-minute segment processing (< 3s each)
  - ✅ Variable segment sizes
  - ✅ Batch processing efficiency

- **Full Document Summary**
  - ✅ From baseline transcript (< 5s)
  - ✅ Large transcript handling (1 hour meetings)

- **End-to-End Workflow**
  - ✅ Complete workflow timing (< 60s for 5min audio)
  - ✅ Throughput measurement (audio min/wall-clock min)
  - ✅ Latency breakdown by stage
  - ✅ Concurrent workflow execution

**Baseline Audio File**:
- Location: `server/routes/api/ai/__tests__/fixtures/baseline.ogg`
- Size: 5.7MB
- Duration: ~300 seconds (5 minutes)
- Format: OGG/Vorbis

**Example**:
```bash
yarn test server/routes/api/ai/__tests__/workflow.benchmark.test.ts
```

---

## Running the Test Suite

### Quick Start

```bash
# Run all AI infrastructure tests
./scripts/test-ai-infrastructure.sh --all

# Run with coverage report
./scripts/test-ai-infrastructure.sh --all --coverage

# Run in watch mode
./scripts/test-ai-infrastructure.sh --all --watch
```

### Selective Testing

```bash
# Run only unit tests (model configuration)
./scripts/test-ai-infrastructure.sh --unit

# Run only integration tests (AI features)
./scripts/test-ai-infrastructure.sh --integration

# Run only fallback mechanism tests
./scripts/test-ai-infrastructure.sh --fallback

# Run only Task model tests
./scripts/test-ai-infrastructure.sh --task

# Run only performance benchmark tests
./scripts/test-ai-infrastructure.sh --benchmark
```

### Advanced Usage

```bash
# Run with verbose output
./scripts/test-ai-infrastructure.sh --all --verbose

# Run unit tests with coverage
./scripts/test-ai-infrastructure.sh --unit --coverage

# Run integration tests in watch mode
./scripts/test-ai-infrastructure.sh --integration --watch
```

### Individual Test Files

```bash
# Run specific test file
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts

# Run specific test suite
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts -t "Environment Variable Configuration"

# Run with coverage
yarn test server/routes/api/ai/__tests__/modelConfig.test.ts --coverage
```

---

## Test Utilities (`testUtils.ts`)

### Helper Functions

```typescript
import {
  MODEL_CONTEXT_WINDOWS,
  AI_FEATURES,
  configureThreeTierModels,
  generateLargeContent,
  estimateTokens,
  fitsInContextWindow,
} from './testUtils';

// Configure three-tier models for a team
await configureThreeTierModels(team, {
  primary: 'zai-glm-4.6',
  task: 'qwen3-30b-a3b-instruct',
  fallback: 'GLM-4.6',
});

// Generate large content for testing
const largeText = generateLargeContent(50000); // 50k tokens

// Estimate token count
const tokens = estimateTokens(text);

// Check if content fits in model
const fits = fitsInContextWindow(text, 'TASK'); // 15k limit
```

### Mock Data Generators

```typescript
import { generators } from './testUtils';

// Generate test documents
const docs = generators.generateTestDocuments(10, [1000, 5000]);

// Generate archive suggestion scenarios
const scenarios = generators.generateArchiveSuggestions();

// Generate sample transcript
const transcript = generateSampleTranscript({
  duration: 600, // 10 minutes
  speakers: ['Alice', 'Bob', 'Carol'],
  wordsPerMinute: 150,
});
```

### Assertion Helpers

```typescript
import { assertions } from './testUtils';

// Validate model name
expect(assertions.isValidModelName('zai-glm-4.6')).toBe(true);

// Check if text fits in model
expect(assertions.fitsInModel(text, 'TASK')).toBe(true);

// Check if error should trigger fallback
expect(assertions.shouldTriggerFallback(429, 'Rate limit exceeded')).toBe(true);
```

---

## Coverage Goals

### Target Coverage

- **Overall**: 90%+
- **Model Configuration**: 95%+
- **Fallback Mechanism**: 100%
- **AI Features**: 85%+
- **Task Model**: 90%+

### Current Coverage

Run with coverage to see current metrics:

```bash
./scripts/test-ai-infrastructure.sh --all --coverage
open coverage/lcov-report/index.html
```

---

## Continuous Integration

### GitHub Actions / GitLab CI

```yaml
# .github/workflows/ai-tests.yml
name: AI Infrastructure Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: yarn install

      - name: Run AI infrastructure tests
        run: ./scripts/test-ai-infrastructure.sh --all --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Troubleshooting

### Common Issues

#### 1. Tests timing out

**Problem**: SSE stream tests timeout

**Solution**: Increase timeout in test file
```typescript
jest.setTimeout(10000); // 10 seconds
```

#### 2. Environment variables not set

**Problem**: Missing `LLM_API_KEY` or `LLM_API_BASE_URL`

**Solution**: Set in `.env.test`
```bash
LLM_API_KEY=test-key
LLM_API_BASE_URL=https://test-api.com
```

#### 3. Database connection errors

**Problem**: Tests fail with database errors

**Solution**: Ensure test database is running
```bash
yarn test:setup
```

#### 4. Mock API not responding

**Problem**: Tests fail with "ECONNREFUSED"

**Solution**: Check if `nock` mocks are properly configured
```typescript
import nock from 'nock';

beforeEach(() => {
  nock.cleanAll();
});
```

---

## Test Data

### Sample Documents

```typescript
const sampleDocuments = [
  {
    title: "Product Roadmap Q1 2024",
    text: "Q1 goals include launching feature A...",
    tokens: 500,
  },
  {
    title: "Technical Architecture Review",
    text: "System architecture consists of...",
    tokens: 2000,
  },
  {
    title: "Large Document",
    text: generateLargeContent(150000), // 150k tokens
    tokens: 150000,
  },
];
```

### Sample Transcripts

```typescript
const sampleTranscripts = [
  {
    duration: 300, // 5 minutes
    text: "[Alice]: Let's discuss the roadmap...\n[Bob]: I agree with...",
    segments: [
      { startTime: 0, endTime: 60, speaker: "Alice", text: "..." },
      { startTime: 60, endTime: 120, speaker: "Bob", text: "..." },
    ],
  },
];
```

---

## Performance Benchmarks

### Running Benchmark Tests

```bash
# Run all benchmark tests
./scripts/test-ai-infrastructure.sh --benchmark

# Run individual benchmark files
yarn test server/routes/api/ai/__tests__/llm.benchmark.test.ts
yarn test server/routes/api/ai/__tests__/workflow.benchmark.test.ts

# Run with verbose output for detailed metrics
./scripts/test-ai-infrastructure.sh --benchmark --verbose
```

### Performance Thresholds

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

### Baseline Audio File

The workflow benchmarks use a baseline audio file for consistent performance testing:

- **Location**: `server/routes/api/ai/__tests__/fixtures/baseline.ogg`
- **Size**: 5.7MB
- **Duration**: ~300 seconds (5 minutes)
- **Format**: OGG/Vorbis audio
- **Source**: Copied from `~/Downloads/Baseline.ogg`

### Key Performance Metrics

**Tokens Per Second (TPS)**:
- Measures throughput of LLM text generation
- Primary Model: ≥ 10 TPS (heavy-duty tasks)
- Task Model: ≥ 20 TPS (lightweight, optimized operations)

**Time to First Token (TTFT)**:
- Measures responsiveness for streaming responses
- Primary Model: ≤ 2 seconds
- Task Model: ≤ 1 second (faster response initiation)

**Transcription Real-Time Ratio**:
- Measures ASR efficiency
- Target: ≥ 10x real-time (1 minute audio processed in ≤ 6 seconds)
- Example: 5 minute audio transcribed in ≤ 30 seconds

**End-to-End Workflow** (5-minute audio):
1. Transcription: ~30s (10x real-time)
2. Title Generation: ~0.2s
3. Segment Summaries: ~0.15s per 5-min segment
4. Full Summary: ~1s
5. **Total**: ≤ 60 seconds

### Benchmark Test Coverage

**LLM Benchmarks** (`llm.benchmark.test.ts`):
- Primary model performance (AI Ask, Search, Generate)
- Task model performance (titles, summaries, suggestions)
- Tokens per second measurement
- Time to first token tracking
- Streaming performance metrics
- Comparative benchmarks (Primary vs Task)
- Load testing and latency percentiles

**Workflow Benchmarks** (`workflow.benchmark.test.ts`):
- Audio transcription performance
- Title generation workflow
- Segment summary generation
- Full document summarization
- End-to-end workflow timing
- Throughput measurement (audio minutes per wall-clock minute)
- Concurrent execution handling

---

## Best Practices

### Writing Tests

1. **Use descriptive test names**
   ```typescript
   it("should use Task model for title generation with 15k token limit")
   ```

2. **Test both success and failure cases**
   ```typescript
   it("should succeed with Primary model")
   it("should fallback to Fallback model on rate limit")
   it("should return error if both models fail")
   ```

3. **Test edge cases**
   ```typescript
   it("should handle context exactly at 15k token limit")
   it("should handle empty transcript")
   it("should handle very large documents (200k+ tokens)")
   ```

4. **Mock external dependencies**
   ```typescript
   jest.mock('@server/services/AIArchiveSuggestionService');
   ```

5. **Clean up after tests**
   ```typescript
   afterEach(async () => {
     await cleanupDatabase();
     nock.cleanAll();
   });
   ```

### Test Organization

- Group related tests in `describe` blocks
- Use `beforeEach` for common setup
- Use `afterEach` for cleanup
- Keep tests independent (no shared state)

---

## Contributing

### Adding New Tests

1. Create test file in `server/routes/api/ai/__tests__/`
2. Use existing test utilities from `testUtils.ts`
3. Follow naming convention: `feature.test.ts`
4. Add to test runner script
5. Update this documentation

### Test Template

```typescript
/**
 * Tests for [Feature Name]
 */

import { buildUser, buildTeam } from "@server/test/factories";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

describe("[Feature Name]", () => {
  describe("[Category]", () => {
    it("should [expected behavior]", async () => {
      const user = await buildUser();

      const res = await server.post("/api/endpoint", {
        body: {
          token: user.getJwtToken(),
          // ... request params
        },
      });

      expect(res.status).toEqual(200);
      // ... assertions
    });
  });
});
```

---

## Resources

- **AI Infrastructure Redesign**: `AI_INFRA_REDESIGN.md`
- **Model Configuration**: `server/env.ts`
- **AI Routes**: `server/routes/api/ai/ai.ts`
- **Test Utilities**: `server/routes/api/ai/__tests__/testUtils.ts`

---

## Contact

For questions or issues with the test suite:
1. Check this documentation
2. Review test files for examples
3. Open an issue with `[AI-TESTS]` prefix
