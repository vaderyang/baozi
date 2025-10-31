import Router from "koa-router";
import trim from "lodash/trim";
import env from "@server/env";
import { InvalidRequestError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

const envValue = (...keys: string[]): string | undefined => {
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
};

type ChatCompletionChoice = {
  text?: string;
  message?: {
    content?: unknown;
  };
};

const parseAiResponse = (choice: ChatCompletionChoice): string => {
  const messageContent = choice?.message?.content;

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((segment: unknown) => {
        if (segment === null || segment === undefined) {
          return "";
        }

        if (typeof segment === "string") {
          return segment;
        }

        const segmentText = segment.text ?? segment.content;

        if (typeof segmentText === "string") {
          return segmentText;
        }

        if (
          segmentText &&
          typeof segmentText === "object" &&
          typeof segmentText.value === "string"
        ) {
          return segmentText.value;
        }

        return "";
      })
      .join("");
  } else if (typeof messageContent === "string") {
    return messageContent;
  } else if (typeof choice?.text === "string") {
    return choice.text;
  }

  return "";
};

router.post(
  "ai.generate",
  auth(),
  validate(T.AiGenerateSchema),
  async (ctx: APIContext<T.AiGenerateReq>) => {
    const prompt = trim(ctx.input.body.prompt ?? "");
    const context = trim(ctx.input.body.context ?? "");

    if (!prompt) {
      ctx.throw(InvalidRequestError("Prompt is required"));
    }

    const apiKey = envValue(
      "LLM_API_KEY",
      "AI_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_KEY"
    );
    const apiBase = envValue(
      "LLM_API_BASE_URL",
      "LLM_API_BASE",
      "AI_API_BASE_URL",
      "AI_API_BASE",
      "OPENAI_API_BASE",
      "OPENAI_API_BASE_URL",
      "API_BASE"
    );
    const model = envValue(
      "LLM_MODEL_NAME",
      "LLM_MODEL",
      "AI_MODEL_NAME",
      "AI_MODEL",
      "OPENAI_MODEL_NAME",
      "OPENAI_MODEL",
      "MODEL"
    );

    if (!apiKey || !apiBase || !model) {
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    try {
      const instructions =
        "You write Markdown for the Outline editor. " +
        "Always emit valid Markdown that renders correctly, and never wrap all output in triple backticks unless required. " +
        "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text.";

      const messages = [
        {
          role: "system",
          content: instructions,
        },
        context
          ? {
              role: "assistant",
              content: context,
            }
          : undefined,
        {
          role: "user",
          content: prompt,
        },
      ].filter(Boolean) as Array<{ role: string; content: string }>;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
        }),
      });

      let payload: unknown = undefined;
      const raw = await response.text();
      try {
        payload = raw ? JSON.parse(raw) : undefined;
      } catch (error) {
        const parseError =
          error instanceof Error ? error : new Error(String(error));
        Logger.error("Failed parsing AI provider response", parseError, {
          raw,
        });
      }

      if (!response.ok) {
        const errorPayload = payload as {
          error?: { message?: string };
          message?: string;
        };

        const message =
          errorPayload?.error?.message ||
          errorPayload?.message ||
          `Request failed with status ${response.status}`;

        Logger.error("AI provider request failed", new Error(message), {
          endpoint,
          status: response.status,
          payload,
        });

        ctx.throw(InvalidRequestError(message));
      }

      const responseBody = payload as {
        choices?: ChatCompletionChoice[];
      };

      if (!responseBody?.choices?.length) {
        ctx.throw(
          InvalidRequestError("AI provider returned an empty response")
        );
      }

      const normalized = parseAiResponse(responseBody.choices[0])
        .replace(/\r/g, "")
        .trim();

      if (!normalized) {
        ctx.throw(
          InvalidRequestError("AI provider returned an empty response")
        );
      }

      ctx.body = {
        data: {
          text: normalized,
        },
      };
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));
      Logger.error("AI text generation failed", wrappedError, { endpoint });
      ctx.throw(
        InvalidRequestError("Sorry, something went wrong while generating")
      );
    }
  }
);

export default router;
