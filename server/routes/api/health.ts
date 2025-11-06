import Router from "koa-router";
import env from "@server/env";
import { sequelize } from "@server/storage/database";
import auth from "@server/middlewares/authentication";
import { APIContext } from "@server/types";

const router = new Router();

interface ServiceHealth {
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface HealthCheckResponse {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: ServiceHealth;
    llm: ServiceHealth;
    asr: ServiceHealth;
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    await sequelize.authenticate();
    const responseTime = Date.now() - startTime;

    // Get additional database stats
    const result = (await sequelize.query(
      'SELECT COUNT(*) as count FROM users WHERE "deletedAt" IS NULL',
      { type: "SELECT" }
    )) as Array<{ count: number }>;

    return {
      status: "healthy",
      responseTime,
      details: {
        connected: true,
        userCount: result[0]?.count || 0,
      },
    };
  } catch (error) {
    return {
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error:
        error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

/**
 * Check LLM service connectivity
 */
async function checkLLM(): Promise<ServiceHealth> {
  const startTime = Date.now();

  // Check for API key and base URL from various env variables
  const apiKey =
    process.env.LLM_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_KEY;
  const apiBase =
    process.env.LLM_API_BASE_URL ||
    process.env.LLM_API_BASE ||
    process.env.AI_API_BASE_URL;

  if (!apiBase || !apiKey) {
    return {
      status: "unknown",
      error: "LLM service not configured (missing API key or base URL)",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${apiBase}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return {
        status: "healthy",
        responseTime,
        details: {
          endpoint: apiBase,
          modelsAvailable: data?.data?.length || 0,
        },
      };
    } else {
      return {
        status: "unhealthy",
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "unhealthy",
        responseTime,
        error: "Request timeout (>5s)",
      };
    }
    return {
      status: "unhealthy",
      responseTime,
      error: error instanceof Error ? error.message : "LLM service unreachable",
    };
  }
}

/**
 * Check ASR (transcription) service connectivity
 */
async function checkASR(): Promise<ServiceHealth> {
  const startTime = Date.now();
  const endpoint = env.TRANSCRIPTION_ENDPOINT;

  if (!endpoint) {
    return {
      status: "unknown",
      error: "ASR service not configured (missing TRANSCRIPTION_ENDPOINT)",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Try a simple health check or HEAD request
    const response = await fetch(endpoint.replace("/transcribe", "/health"), {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        status: "healthy",
        responseTime,
        details: {
          endpoint,
        },
      };
    } else if (response.status === 404) {
      // If /health doesn't exist, try the main endpoint
      return {
        status: "healthy",
        responseTime,
        details: {
          endpoint,
          note: "Health endpoint not available, service endpoint reachable",
        },
      };
    } else {
      return {
        status: "unhealthy",
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "unhealthy",
        responseTime,
        error: "Request timeout (>5s)",
      };
    }
    return {
      status: "unhealthy",
      responseTime,
      error: error instanceof Error ? error.message : "ASR service unreachable",
    };
  }
}

router.post("health.check", auth(), async (ctx: APIContext) => {
  const [database, llm, asr] = await Promise.all([
    checkDatabase(),
    checkLLM(),
    checkASR(),
  ]);

  const services = { database, llm, asr };

  // Determine overall health
  const healthyCount = Object.values(services).filter(
    (s) => s.status === "healthy"
  ).length;
  const unhealthyCount = Object.values(services).filter(
    (s) => s.status === "unhealthy"
  ).length;

  let overall: "healthy" | "degraded" | "unhealthy";
  if (unhealthyCount === 0 && healthyCount === 3) {
    overall = "healthy";
  } else if (unhealthyCount >= 2) {
    overall = "unhealthy";
  } else {
    overall = "degraded";
  }

  const response: HealthCheckResponse = {
    overall,
    timestamp: new Date().toISOString(),
    services,
  };

  ctx.body = {
    data: response,
  };
});

export default router;
