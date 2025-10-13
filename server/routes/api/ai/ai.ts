import Router from "koa-router";
import env from "@server/env";
import fetch from "@server/utils/fetch";
import { RateLimitExceededError, ValidationError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

router.post(
  "ai.generate",
  auth({ optional: env.isDevelopment }),
  validate(T.GenerateSchema),
  async (ctx: APIContext<T.GenerateReq>) => {
    const { prompt } = ctx.input.body;

    // Dev mode: allow bypass with special header
    let actor = ctx.state.auth?.user;
    if (env.isDevelopment && !actor) {
      const devKey = ctx.request.headers["x-dev-api-key"];
      if (devKey === "dev_test_key") {
        // Create a mock user for dev testing
        actor = {
          id: "dev-user",
          name: "Dev User",
          email: "dev@test.local",
        } as unknown as { id: string; name?: string; email?: string };
        Logger.info("Dev mode: Using bypass authentication");
      }
    }

    if (!actor) {
      throw ValidationError("Authentication required");
    }

    // Validate LLM configuration
    if (!env.LLM_API_KEY || !env.LLM_API_BASE_URL || !env.LLM_MODEL_NAME) {
      Logger.error("LLM configuration missing", {
        userId: actor.id,
        hasApiKey: !!env.LLM_API_KEY,
        hasBaseUrl: !!env.LLM_API_BASE_URL,
        hasModelName: !!env.LLM_MODEL_NAME,
      });
      throw ValidationError(
        "AI text generation is not configured on this server"
      );
    }

    try {
      // Call OpenAI-compatible API
      const response = await fetch(`${env.LLM_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.LLM_MODEL_NAME,
          messages: [
            {
              role: "system",
              content:
                "You are assisting in generating Markdown content for an editor. Always respond in Markdown. Begin with a single Subject line as an H1 heading in the format: '# <Subject>'. Then include the detailed content after a blank line. Do not include any other preface, titles, or explanations. Output only the Subject heading and the content.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
        }),
        // Allow private IP addresses in development (for local LLM servers)
        allowPrivateIPAddress: env.isDevelopment,
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("LLM API error", {
          userId: actor.id,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        if (response.status === 429) {
          throw RateLimitExceededError(
            "AI service rate limit exceeded, please try again later"
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw ValidationError(
            "AI service authentication failed, please contact support"
          );
        }

        if (response.status >= 500) {
          throw new Error(
            "AI service is temporarily unavailable, please try again later"
          );
        }

        throw new Error(`AI service returned error: ${response.statusText}`);
      }

      const data = await response.json();
      const generatedText = data?.choices?.[0]?.message?.content?.trim() || "";

      if (!generatedText) {
        Logger.warn("LLM returned empty response", {
          userId: actor.id,
          prompt: prompt.substring(0, 100),
        });
        throw ValidationError(
          "AI service returned an empty response, please try again"
        );
      }

      Logger.info("AI text generated successfully", {
        userId: actor.id,
        promptLength: prompt.length,
        responseLength: generatedText.length,
      });

      ctx.body = {
        data: {
          text: generatedText,
        },
      };
    } catch (error) {
      // If it's already a custom error, rethrow it
      if (
        error instanceof RateLimitExceededError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      // Log unexpected errors
      Logger.error("Unexpected error in AI generation", error, {
        userId: actor.id,
        prompt: prompt.substring(0, 100),
      });

      // Throw a generic error for unexpected cases
      throw new Error(
        "An unexpected error occurred during AI generation, please try again"
      );
    }
  }
);

export default router;
