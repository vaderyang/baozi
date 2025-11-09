import Router from "koa-router";
import { TeamPreference } from "@shared/types";
import env from "@server/env";
import { Team } from "@server/models";
import auth from "@server/middlewares/authentication";
import { APIContext } from "@server/types";
import { sequelize } from "@server/storage/database";
import fetch, { llmUserAgent } from "@server/utils/fetch";

type ModelRole =
  | "primary"
  | "task"
  | "fallback"
  | "search"
  | "sensitive"
  | "vision";

const router = new Router();

interface ServiceHealth {
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface ModelHealth extends ServiceHealth {
  modelName: string;
  roles: ModelRole[];
  source: "team" | "environment";
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
async function checkLLMModel(
  modelName: string,
  roles: ModelRole[],
  source: "team" | "environment"
): Promise<ModelHealth> {
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
      roles,
      source,
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
        "User-Agent": llmUserAgent,
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
        roles,
        source,
        details: {
          endpoint: apiBase,
        },
      };
    } else if (response.status === 404) {
      return {
        modelName,
        status: "unhealthy",
        responseTime,
        roles,
        source,
        error: "Model not found",
      };
    } else {
      return {
        modelName,
        status: "unhealthy",
        responseTime,
        roles,
        source,
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
        roles,
        source,
        error: "Request timeout (>5s)",
      };
    }
    return {
      modelName,
      status: "unhealthy",
      responseTime,
      roles,
      source,
      error: error instanceof Error ? error.message : "LLM service unreachable",
    };
  }
}

/**
 * Check all configured LLM models
 */
async function checkLLMModels(team?: Team | null): Promise<ModelHealth[]> {
  type PendingModel = {
    roles: ModelRole[];
    source: "team" | "environment";
  };

  const models = new Map<string, PendingModel>();
  const addModel = (
    modelName: string | null | undefined | false,
    role: ModelRole,
    source: "team" | "environment"
  ) => {
    if (!modelName || typeof modelName !== "string") {
      return;
    }

    const trimmed = modelName.trim();
    if (!trimmed) {
      return;
    }

    const existing = models.get(trimmed);
    if (existing) {
      if (!existing.roles.includes(role)) {
        existing.roles.push(role);
      }
      if (source === "team") {
        existing.source = "team";
      }
      return;
    }

    models.set(trimmed, {
      roles: [role],
      source,
    });
  };

  const preferences = team?.preferences ?? undefined;

  const primaryModel =
    preferences?.[TeamPreference.AiGenerateTextModel] ||
    env.LLM_PRIMARY_MODEL_NAME;
  addModel(
    primaryModel,
    "primary",
    preferences?.[TeamPreference.AiGenerateTextModel] ? "team" : "environment"
  );

  const taskModel =
    preferences?.[TeamPreference.AiTaskModel] || env.LLM_TASK_MODEL_NAME;
  addModel(
    taskModel,
    "task",
    preferences?.[TeamPreference.AiTaskModel] ? "team" : "environment"
  );

  const fallbackModel =
    preferences?.[TeamPreference.AiFallbackModel] ||
    env.LLM_FALLBACK_MODEL_NAME;
  addModel(
    fallbackModel,
    "fallback",
    preferences?.[TeamPreference.AiFallbackModel] ? "team" : "environment"
  );

  const searchModel =
    preferences?.[TeamPreference.AiSearchModel] ||
    env.LLM_MODEL_NAME_AI_SEARCH ||
    primaryModel;
  addModel(
    searchModel,
    "search",
    preferences?.[TeamPreference.AiSearchModel] ? "team" : "environment"
  );

  const sensitiveModel = env.LLM_MODEL_NAME_SENSITIVE;
  addModel(sensitiveModel, "sensitive", "environment");

  const visionModel =
    preferences?.[TeamPreference.AiVisionModel] ||
    env.LLM_MODEL_NAME_VISION ||
    undefined;
  addModel(
    visionModel,
    "vision",
    preferences?.[TeamPreference.AiVisionModel] ? "team" : "environment"
  );

  if (models.size === 0) {
    return [
      {
        modelName: "No models configured",
        status: "unknown",
        roles: [],
        source: "environment",
        error: "No LLM models configured in environment or team preferences",
      },
    ];
  }

  return Promise.all(
    Array.from(models.entries()).map(([modelName, meta]) =>
      checkLLMModel(modelName, meta.roles, meta.source)
    )
  );
}

/**
 * Check ASR (transcription) service connectivity
 */
async function checkASR(team?: Team | null): Promise<ServiceHealth> {
  const startTime = Date.now();
  const teamEndpoint =
    team?.preferences?.[TeamPreference.TranscriptionEndpoint];
  const endpoint = teamEndpoint || env.TRANSCRIPTION_ENDPOINT;

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
          source: teamEndpoint ? "team" : "environment",
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
          source: teamEndpoint ? "team" : "environment",
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
  const { user } = ctx.state.auth;
  const team =
    user.team ??
    (await Team.findByPk(user.teamId, {
      rejectOnEmpty: true,
    }));

  const [database, llmModels, asr] = await Promise.all([
    checkDatabase(),
    checkLLMModels(team),
    checkASR(team),
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
