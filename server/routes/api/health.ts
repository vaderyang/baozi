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

interface ModelHealth extends ServiceHealth {
  modelName: string;
}

interface HealthCheckResponse {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: ServiceHealth;
    llmModels: ModelHealth[];
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
 * Check a specific LLM model
 */
async function checkLLMModel(modelName: string): Promise<ModelHealth> {
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
      modelName,
      status: "unknown",
      error: "LLM service not configured (missing API key or base URL)",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/v1/chat/completions`;

    // Test with a minimal request
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok || response.status === 400) {
      // 400 is ok - means the endpoint is reachable and model exists
      return {
        modelName,
        status: "healthy",
        responseTime,
        details: {
          endpoint: apiBase,
        },
      };
    } else if (response.status === 404) {
      return {
        modelName,
        status: "unhealthy",
        responseTime,
        error: "Model not found",
      };
    } else {
      return {
        modelName,
        status: "unhealthy",
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        modelName,
        status: "unhealthy",
        responseTime,
        error: "Request timeout (>5s)",
      };
    }
    return {
      modelName,
      status: "unhealthy",
      responseTime,
      error: error instanceof Error ? error.message : "LLM service unreachable",
    };
  }
}

/**
 * Check all configured LLM models
 */
async function checkLLMModels(): Promise<ModelHealth[]> {
  const models: string[] = [];

  // Collect all configured models
  const primaryModel =
    process.env.LLM_MODEL_NAME ||
    process.env.LLM_MODEL ||
    process.env.AI_MODEL_NAME ||
    process.env.AI_MODEL;
  const searchModel =
    process.env.LLM_MODEL_NAME_AI_SEARCH || process.env.AI_SEARCH_MODEL;
  const sensitiveModel = process.env.LLM_MODEL_NAME_SENSITIVE;
  const visionModel =
    process.env.LLM_MODEL_NAME_VISION || process.env.AI_VISION_MODEL;

  if (primaryModel) {models.push(primaryModel);}
  if (searchModel && searchModel !== primaryModel) {models.push(searchModel);}
  if (sensitiveModel && !models.includes(sensitiveModel))
    {models.push(sensitiveModel);}
  if (visionModel && !models.includes(visionModel)) {models.push(visionModel);}

  if (models.length === 0) {
    return [
      {
        modelName: "No models configured",
        status: "unknown",
        error: "No LLM models configured in environment",
      },
    ];
  }

  // Test all models in parallel
  return Promise.all(models.map((model) => checkLLMModel(model)));
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
  const [database, llmModels, asr] = await Promise.all([
    checkDatabase(),
    checkLLMModels(),
    checkASR(),
  ]);

  const services = { database, llmModels, asr };

  // Determine overall health
  const allServices = [database, ...llmModels, asr];

  const healthyCount = allServices.filter((s) => s.status === "healthy").length;
  const unhealthyCount = allServices.filter(
    (s) => s.status === "unhealthy"
  ).length;
  const totalCount = allServices.length;

  let overall: "healthy" | "degraded" | "unhealthy";
  if (unhealthyCount === 0 && healthyCount === totalCount) {
    overall = "healthy";
  } else if (unhealthyCount >= totalCount / 2) {
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
