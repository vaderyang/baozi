/**
 * Test Utilities for AI Infrastructure Testing
 *
 * Provides helper functions, mocks, and fixtures for testing AI features
 */

import { TeamPreference } from "@shared/types";
import type { Team } from "@server/models";

/**
 * Model context window sizes (in tokens)
 */
export const MODEL_CONTEXT_WINDOWS = {
  PRIMARY: {
    name: "zai-glm-4.6",
    tokens: 200000,
    description: "Primary model for heavy-duty AI tasks",
  },
  TASK: {
    name: "qwen3-30b-a3b-instruct",
    tokens: 15000,
    description: "Task model for lightweight operations",
  },
  FALLBACK: {
    name: "GLM-4.6",
    tokens: 200000,
    description: "Universal fallback model",
  },
} as const;

/**
 * AI feature categorization by model tier
 */
export const AI_FEATURES = {
  PRIMARY_MODEL: [
    { name: "AI Ask", endpoint: "/api/ai.ask", method: "POST" },
    { name: "AI Search", endpoint: "/api/ai.search", method: "POST" },
    { name: "AI Generate", endpoint: "/api/ai.generate", method: "POST" },
    { name: "AI Summary", purpose: "full document summary" },
  ],
  TASK_MODEL: [
    { name: "Title Generation", purpose: "document titles" },
    { name: "Transcript Summaries", purpose: "time-segment summaries" },
    { name: "AI Suggestions", purpose: "editor suggestions" },
    { name: "Archive Suggestions", purpose: "location suggestions" },
    { name: "Topic Extraction", purpose: "topic categorization" },
  ],
} as const;

/**
 * Error scenarios that should trigger fallback
 */
export const FALLBACK_TRIGGERS = {
  RATE_LIMIT: {
    status: 429,
    messages: ["Rate limit exceeded", "too many requests"],
  },
  CONTEXT_OVERFLOW: {
    status: 400,
    messages: [
      "context_length_exceeded",
      "maximum context length",
      "token limit exceeded",
    ],
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    messages: ["service unavailable", "no server is available"],
  },
  INTERNAL_ERROR: {
    status: 500,
    messages: ["internal server error"],
  },
} as const;

/**
 * Error scenarios that should NOT trigger fallback
 */
export const NON_FALLBACK_ERRORS = {
  AUTHENTICATION: { status: 401, message: "Unauthorized" },
  AUTHORIZATION: { status: 403, message: "Forbidden" },
  NOT_FOUND: { status: 404, message: "Not Found" },
  INVALID_REQUEST: { status: 400, message: "Invalid parameter" },
} as const;

/**
 * Configure a team with three-tier model system
 */
export async function configureThreeTierModels(
  team: Team,
  options?: {
    primary?: string;
    task?: string;
    fallback?: string;
  }
) {
  await team.save({
    preferences: {
      ...team.preferences,
      [TeamPreference.AiGenerateTextModel]:
        options?.primary || MODEL_CONTEXT_WINDOWS.PRIMARY.name,
      [TeamPreference.AiSearchModel]:
        options?.primary || MODEL_CONTEXT_WINDOWS.PRIMARY.name,
      [TeamPreference.AiTaskModel]:
        options?.task || MODEL_CONTEXT_WINDOWS.TASK.name,
      [TeamPreference.AiFallbackModel]:
        options?.fallback || MODEL_CONTEXT_WINDOWS.FALLBACK.name,
    },
  });

  await team.reload();
  return team;
}

/**
 * Generate large text content for testing context windows
 */
export function generateLargeContent(targetTokens: number): string {
  // Rough estimate: 1 token ≈ 4 characters
  const chars = targetTokens * 4;
  const words = Math.floor(chars / 6); // Average word length ~6 chars
  const result: string[] = [];

  for (let i = 0; i < words; i++) {
    result.push(`word${i}`);
  }

  return result.join(" ");
}

/**
 * Estimate token count from text
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Check if content fits within model context window
 */
export function fitsInContextWindow(
  text: string,
  model: "PRIMARY" | "TASK" | "FALLBACK"
): boolean {
  const tokens = estimateTokens(text);
  return tokens < MODEL_CONTEXT_WINDOWS[model].tokens;
}

/**
 * Mock LLM API response
 */
export interface MockLLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export function createMockLLMResponse(content: string): MockLLMResponse {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

/**
 * Mock error response from LLM API
 */
export interface MockLLMError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

export function createMockLLMError(
  message: string,
  type?: string
): MockLLMError {
  return {
    error: {
      message,
      type,
    },
  };
}

/**
 * Generate sample transcript for testing
 */
export function generateSampleTranscript(options?: {
  duration?: number; // in seconds
  speakers?: string[];
  wordsPerMinute?: number;
}): string {
  const duration = options?.duration || 300; // 5 minutes default
  const speakers = options?.speakers || ["Alice", "Bob"];
  const wpm = options?.wordsPerMinute || 150;

  const totalWords = Math.floor((duration / 60) * wpm);
  const wordsPerSpeaker = Math.floor(totalWords / speakers.length);

  const segments: string[] = [];

  speakers.forEach((speaker, index) => {
    const words: string[] = [];
    for (let i = 0; i < wordsPerSpeaker; i++) {
      words.push(`word${index}_${i}`);
    }
    segments.push(`[${speaker}]: ${words.join(" ")}`);
  });

  return segments.join("\n\n");
}

/**
 * Generate sample time-segmented transcript
 */
export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export function generateSegmentedTranscript(options?: {
  segments?: number;
  duration?: number; // total duration in seconds
}): TranscriptSegment[] {
  const segmentCount = options?.segments || 4;
  const totalDuration = options?.duration || 1200; // 20 minutes default
  const segmentDuration = totalDuration / segmentCount;

  const speakers = ["Alice", "Bob", "Carol"];
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < segmentCount; i++) {
    segments.push({
      startTime: i * segmentDuration,
      endTime: (i + 1) * segmentDuration,
      speaker: speakers[i % speakers.length],
      text: `Segment ${i + 1} content from ${speakers[i % speakers.length]}`,
    });
  }

  return segments;
}

/**
 * Wait for SSE stream to complete (for testing)
 */
export async function collectSSEEvents(
  response: Response,
  timeout: number = 5000
): Promise<string[]> {
  const events: string[] = [];
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("SSE timeout")), timeout);
  });

  try {
    await Promise.race([
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(line.substring(6));
            }
          }
        }
      })(),
      timeoutPromise,
    ]);
  } catch (error) {
    // Timeout is acceptable for SSE streams
    if (error instanceof Error && error.message !== "SSE timeout") {
      throw error;
    }
  }

  return events;
}

/**
 * Assertion helpers
 */
export const assertions = {
  /**
   * Assert that a model name is valid
   */
  isValidModelName(modelName: string): boolean {
    const validModels = [
      MODEL_CONTEXT_WINDOWS.PRIMARY.name,
      MODEL_CONTEXT_WINDOWS.TASK.name,
      MODEL_CONTEXT_WINDOWS.FALLBACK.name,
      "custom-model", // Allow custom models
    ];

    return (
      validModels.includes(modelName) ||
      modelName.includes("custom-") ||
      modelName.includes("gpt-") ||
      modelName.includes("claude-") ||
      modelName.includes("glm-") ||
      modelName.includes("qwen")
    );
  },

  /**
   * Assert that context fits in model
   */
  fitsInModel(text: string, model: "PRIMARY" | "TASK" | "FALLBACK"): boolean {
    return fitsInContextWindow(text, model);
  },

  /**
   * Assert that error should trigger fallback
   */
  shouldTriggerFallback(status: number, message: string): boolean {
    const triggers = Object.values(FALLBACK_TRIGGERS);

    return triggers.some(
      (trigger) =>
        trigger.status === status ||
        trigger.messages.some((msg) =>
          message.toLowerCase().includes(msg.toLowerCase())
        )
    );
  },
};

/**
 * Test data generators
 */
export const generators = {
  /**
   * Generate test documents with varying sizes
   */
  generateTestDocuments(count: number, tokenRange: [number, number]) {
    const docs = [];
    for (let i = 0; i < count; i++) {
      const tokens =
        tokenRange[0] + Math.random() * (tokenRange[1] - tokenRange[0]);
      docs.push({
        title: `Test Document ${i + 1}`,
        text: generateLargeContent(Math.floor(tokens)),
        tokens: Math.floor(tokens),
      });
    }
    return docs;
  },

  /**
   * Generate archive suggestion scenarios
   */
  generateArchiveSuggestions() {
    return [
      {
        transcript: "Discussed Q1 sales targets and marketing campaigns",
        expectedType: "meeting",
        expectedTopics: ["sales", "marketing", "Q1"],
        expectedCollection: "Sales",
      },
      {
        transcript: "Interview with candidate for senior engineer position",
        expectedType: "interview",
        expectedTopics: ["hiring", "engineering", "candidate"],
        expectedCollection: "HR",
      },
      {
        transcript: "Quick note about the bug fix for login issue",
        expectedType: "note",
        expectedTopics: ["bug", "login", "fix"],
        expectedCollection: "Engineering",
      },
    ];
  },
};

/**
 * Performance measurement utilities for benchmarking
 */

export interface PerformanceMetrics {
  /** Total execution time in milliseconds */
  totalTime: number;
  /** Time to first token in milliseconds (for streaming responses) */
  timeToFirstToken?: number;
  /** Tokens per second */
  tokensPerSecond?: number;
  /** Total tokens generated */
  totalTokens?: number;
  /** Average token generation time in milliseconds */
  averageTokenTime?: number;
}

export interface StreamingMetrics {
  /** Time when first chunk received */
  firstChunkTime: number;
  /** Time when last chunk received */
  lastChunkTime: number;
  /** Number of chunks received */
  chunkCount: number;
  /** Total characters received */
  totalCharacters: number;
  /** Estimated total tokens */
  estimatedTokens: number;
}

/**
 * Measure LLM performance metrics
 */
export async function measureLLMPerformance<T>(
  operation: () => Promise<T>,
  options?: {
    /** Expected token count for calculating TPS */
    expectedTokens?: number;
  }
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const startTime = performance.now();
  const result = await operation();
  const endTime = performance.now();

  const totalTime = endTime - startTime;
  const metrics: PerformanceMetrics = { totalTime };

  if (options?.expectedTokens) {
    metrics.totalTokens = options.expectedTokens;
    metrics.tokensPerSecond = (options.expectedTokens / totalTime) * 1000;
    metrics.averageTokenTime = totalTime / options.expectedTokens;
  }

  return { result, metrics };
}

/**
 * Measure streaming response performance
 */
export async function measureStreamingPerformance(
  streamReader: ReadableStreamDefaultReader<Uint8Array>,
  timeout: number = 30000
): Promise<{ events: string[]; metrics: StreamingMetrics }> {
  const events: string[] = [];
  const decoder = new TextDecoder();
  let buffer = "";

  const startTime = performance.now();
  let firstChunkTime = 0;
  let lastChunkTime = 0;
  let chunkCount = 0;
  let totalCharacters = 0;

  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("Stream timeout")), timeout);
  });

  try {
    await Promise.race([
      (async () => {
        while (true) {
          const { done, value } = await streamReader.read();

          if (done) {
            break;
          }

          const currentTime = performance.now();

          if (chunkCount === 0) {
            firstChunkTime = currentTime - startTime;
          }

          lastChunkTime = currentTime - startTime;
          chunkCount++;

          const chunk = decoder.decode(value, { stream: true });
          totalCharacters += chunk.length;
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(line.substring(6));
            }
          }
        }
      })(),
      timeoutPromise,
    ]);
  } catch (error) {
    // Timeout is acceptable for streaming tests
    if (error instanceof Error && error.message !== "Stream timeout") {
      throw error;
    }
  }

  const metrics: StreamingMetrics = {
    firstChunkTime,
    lastChunkTime,
    chunkCount,
    totalCharacters,
    estimatedTokens: estimateTokens(events.join("")),
  };

  return { events, metrics };
}

/**
 * Benchmark helpers
 */
export const benchmarks = {
  /**
   * Expected performance thresholds for LLM operations
   */
  thresholds: {
    PRIMARY_MODEL: {
      // Primary model (zai-glm-4.6, 200k context)
      maxLatency: 10000, // 10 seconds max
      minTPS: 10, // Minimum 10 tokens/second
      maxFirstTokenTime: 2000, // 2 seconds max for first token
    },
    TASK_MODEL: {
      // Task model (qwen3-30b-a3b-instruct, 15k context)
      maxLatency: 3000, // 3 seconds max
      minTPS: 20, // Minimum 20 tokens/second (faster)
      maxFirstTokenTime: 1000, // 1 second max for first token
    },
    TRANSCRIPTION: {
      // Transcription performance (per minute of audio)
      maxLatencyPerMinute: 5000, // 5 seconds per minute of audio
      minRealTimeRatio: 0.1, // At least 10x real-time (1 min audio in 6 sec)
    },
    SUMMARY: {
      // Transcript summary generation
      maxLatency: 5000, // 5 seconds max
      minTPS: 15, // Minimum 15 tokens/second
    },
  },

  /**
   * Run a benchmark test with performance assertions
   */
  async runBenchmark<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
      maxLatency?: number;
      expectedTokens?: number;
      minTPS?: number;
      maxFirstTokenTime?: number;
    }
  ): Promise<{ result: T; metrics: PerformanceMetrics; passed: boolean }> {
    const { result, metrics } = await measureLLMPerformance(operation, options);

    let passed = true;

    if (options.maxLatency && metrics.totalTime > options.maxLatency) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️  ${name}: Latency ${metrics.totalTime.toFixed(0)}ms exceeds threshold ${options.maxLatency}ms`
      );
      passed = false;
    }

    if (
      options.minTPS &&
      metrics.tokensPerSecond &&
      metrics.tokensPerSecond < options.minTPS
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️  ${name}: TPS ${metrics.tokensPerSecond.toFixed(1)} below threshold ${options.minTPS}`
      );
      passed = false;
    }

    if (
      options.maxFirstTokenTime &&
      metrics.timeToFirstToken &&
      metrics.timeToFirstToken > options.maxFirstTokenTime
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️  ${name}: First token time ${metrics.timeToFirstToken.toFixed(0)}ms exceeds threshold ${options.maxFirstTokenTime}ms`
      );
      passed = false;
    }

    return { result, metrics, passed };
  },

  /**
   * Format metrics for display
   */
  formatMetrics(metrics: PerformanceMetrics): string {
    const parts: string[] = [];

    parts.push(`Total: ${metrics.totalTime.toFixed(0)}ms`);

    if (metrics.timeToFirstToken) {
      parts.push(`TTFT: ${metrics.timeToFirstToken.toFixed(0)}ms`);
    }

    if (metrics.tokensPerSecond) {
      parts.push(`TPS: ${metrics.tokensPerSecond.toFixed(1)}`);
    }

    if (metrics.totalTokens) {
      parts.push(`Tokens: ${metrics.totalTokens}`);
    }

    return parts.join(" | ");
  },

  /**
   * Format streaming metrics for display
   */
  formatStreamingMetrics(metrics: StreamingMetrics): string {
    const parts: string[] = [];

    parts.push(`TTFT: ${metrics.firstChunkTime.toFixed(0)}ms`);
    parts.push(`Total: ${metrics.lastChunkTime.toFixed(0)}ms`);
    parts.push(`Chunks: ${metrics.chunkCount}`);
    parts.push(`Chars: ${metrics.totalCharacters}`);
    parts.push(`~Tokens: ${metrics.estimatedTokens}`);

    if (metrics.lastChunkTime > 0) {
      const tps = (metrics.estimatedTokens / metrics.lastChunkTime) * 1000;
      parts.push(`TPS: ${tps.toFixed(1)}`);
    }

    return parts.join(" | ");
  },
};
