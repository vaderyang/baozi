import trim from "lodash/trim";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { Team } from "@server/models";
import { AiPromptMode, TeamPreference } from "@shared/types";
import BaseTask, { TaskPriority } from "./BaseTask";

type Props = {
  /** The ID of the AI summary job */
  jobId: string;
  /** The ID of the user who initiated the summary */
  userId: string;
  /** The ID of the team */
  teamId: string;
  /** The prompt for AI generation */
  prompt: string;
  /** The context/transcript text */
  context: string;
  /** The mode for AI generation */
  mode?: AiPromptMode;
};

/**
 * A task that processes AI summary generation jobs in the background.
 * Generates summaries using the LLM and updates the job status with the result.
 */
export default class AISummaryTask extends BaseTask<Props> {
  public async perform(props: Props): Promise<void> {
    const { jobId, userId, teamId, prompt, context, mode = "fast" } = props;

    Logger.info("task", "Starting AI summary task", {
      jobId,
      userId,
      teamId,
      promptLength: prompt.length,
      contextLength: context.length,
      mode,
    });

    // Import the AISummaryJob model
    const { default: AISummaryJob } = await import("@server/models/AISummaryJob");
    const { default: AISummaryJobStatus } = await import("@server/models/AISummaryJob");

    // Fetch the AI summary job
    const job = await AISummaryJob.findByPk(jobId, {
      rejectOnEmpty: true,
    });

    try {
      // Update job status to processing
      await job.updateStatus(AISummaryJobStatus.Processing);

      // Get model configuration
      const { apiKey, apiBase, model } = await this.getModelConfig(
        'primary',
        teamId,
        prompt.length + context.length
      );

      if (!apiKey || !apiBase || !model) {
        throw new Error("AI configuration is incomplete");
      }

      const trimmedBase = apiBase.replace(/\/$/, "");
      const endpoint = /\/chat\/completions$/i.test(trimmedBase)
        ? trimmedBase
        : `${trimmedBase}/chat/completions`;

      const instructions =
        "You write Markdown Text upon user's request. " +
        "Always emit valid Markdown that renders correctly. " +
        "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
        "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text. " +
        "If writing a meeting minutes or summary, be professional thinking the sections and the format. " +
        "CRITICAL: When summarizing or processing provided context, ONLY use information from that context - DO NOT add external information or make up content. " +
        "If the provided context is insufficient or unclear, state that clearly instead of fabricating information.";

      const messages = [
        { role: "system", content: instructions },
        { role: "user", content: `${context}\n\n${prompt}` },
      ];

      Logger.info("task", "Sending request to LLM API", {
        jobId,
        endpoint,
        model,
        messageCount: messages.length,
      });

      const requestStartTime = Date.now();
      const result = await this.callLLM(endpoint, apiKey, model, messages);
      const requestDuration = Date.now() - requestStartTime;

      Logger.info("task", "Received response from LLM", {
        jobId,
        model,
        requestDurationMs: requestDuration,
        resultLength: result.length,
      });

      // Mark job as completed with result
      await job.complete(result);

      Logger.info("task", "AI summary task completed successfully", {
        jobId,
        requestDurationMs: requestDuration,
        resultLength: result.length,
      });
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));

      Logger.error("AI summary task failed", wrappedError, {
        jobId,
        userId,
        teamId,
      });

      // Determine error message
      let errorMessage = wrappedError.message;
      if (
        wrappedError.message.includes("context_length_exceeded") ||
        wrappedError.message.includes("maximum context length")
      ) {
        errorMessage =
          "The transcript is too long for the AI to process. Please try with a shorter segment.";
      } else if (
        wrappedError.message.includes("rate_limit") ||
        wrappedError.message.includes("429")
      ) {
        errorMessage =
          "Rate limit exceeded. Please try again in a few moments.";
      } else if (
        wrappedError.message.includes("ECONNREFUSED") ||
        wrappedError.message.includes("ENOTFOUND")
      ) {
        errorMessage =
          "AI service is not available. Please check the service configuration.";
      }

      // Update job status to failed
      await job.fail(errorMessage);

      // Re-throw to trigger retry logic
      throw wrappedError;
    }
  }

  /**
   * Get model configuration from team preferences or environment.
   */
  private async getModelConfig(
    purpose: 'primary' | 'task',
    teamId: string,
    contextLength: number
  ): Promise<{
    apiKey: string;
    apiBase: string;
    model: string;
    fallbackModel?: string;
  }> {
    const apiKey = this.envValue(
      "LLM_API_KEY",
      "AI_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_KEY"
    );
    const apiBase = this.envValue(
      "LLM_API_BASE_URL",
      "LLM_API_BASE",
      "AI_API_BASE_URL",
      "AI_API_BASE",
      "OPENAI_API_BASE",
      "OPENAI_API_BASE_URL",
      "API_BASE"
    );

    if (!apiKey || !apiBase) {
      throw new Error("AI API configuration not found in environment");
    }

    // Get team for preferences
    const team = await Team.findByPk(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Determine model based on purpose and context length
    let model: string;
    const maxTaskContextLength = parseInt(env.LLM_MAX_CONTEXT_LENGTH || "15000", 10);

    if (purpose === 'task' && contextLength <= maxTaskContextLength) {
      // Use task model for lightweight operations
      const taskModelPref = team.getPreference(TeamPreference.AiTaskModel);
      model =
        (typeof taskModelPref === "string" && taskModelPref.trim()) ||
        env.LLM_TASK_MODEL_NAME ||
        env.LLM_MODEL_NAME ||
        "qwen3-30b-a3b-instruct";
    } else {
      // Use primary model for heavy tasks or long context
      const primaryModelPref = team.getPreference(TeamPreference.AiGenerateTextModel);
      model =
        (typeof primaryModelPref === "string" && primaryModelPref.trim()) ||
        env.LLM_PRIMARY_MODEL_NAME ||
        env.LLM_MODEL_NAME ||
        "zai-glm-4.6";
    }

    // Get fallback model
    const fallbackModelPref = team.getPreference(TeamPreference.AiFallbackModel);
    const fallbackModel =
      (typeof fallbackModelPref === "string" && fallbackModelPref.trim()) ||
      env.LLM_FALLBACK_MODEL_NAME ||
      "GLM-4.6";

    return { apiKey, apiBase, model, fallbackModel };
  }

  /**
   * Call the LLM API with retry and fallback logic.
   */
  private async callLLM(
    endpoint: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const fetch = (await import("@server/utils/fetch")).default;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(
        "LLM API error",
        new Error(`Status ${response.status}: ${errorText}`),
        {
          endpoint,
          model,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500),
        }
      );
      throw new Error(`LLM API failed: ${response.statusText}`);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("No text in LLM response");
    }

    return trim(text);
  }

  /**
   * Get environment value with fallback keys.
   */
  private envValue(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = (env as unknown as Record<string, unknown>)[key];
      if (typeof value === "string" && value) {
        return value;
      }

      const processValue = process.env[key];
      if (typeof processValue === "string" && processValue) {
        return processValue;
      }
    }

    return undefined;
  }

  /**
   * Handle final failure when all retry attempts are exhausted.
   */
  public async onFailed(props: Props): Promise<void> {
    const { jobId } = props;

    Logger.error(
      "AI summary task failed after all retry attempts",
      new Error("Max retries exhausted"),
      {
        jobId,
      }
    );

    try {
      const { default: AISummaryJob } = await import("@server/models/AISummaryJob");
      const { default: AISummaryJobStatus } = await import("@server/models/AISummaryJob");

      const job = await AISummaryJob.findByPk(jobId);
      if (job && job.status !== AISummaryJobStatus.Failed) {
        await job.fail(
          "AI summary generation failed after multiple attempts. Please try again later."
        );
      }
    } catch (error) {
      Logger.error(
        "Failed to update job status in onFailed handler",
        error as Error,
        {
          jobId,
        }
      );
    }
  }

  /**
   * Job options with exponential backoff retry logic.
   */
  public get options() {
    return {
      priority: TaskPriority.Normal,
      attempts: 3,
      backoff: {
        type: "exponential" as const,
        delay: 60000, // 1 minute
      },
      timeout: 5 * 60 * 1000, // 5 minutes timeout
    };
  }
}
