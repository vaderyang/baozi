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

        const segmentObj = segment as Record<string, unknown>;
        const segmentText = segmentObj.text ?? segmentObj.content;

        if (typeof segmentText === "string") {
          return segmentText;
        }

        if (
          segmentText &&
          typeof segmentText === "object" &&
          typeof (segmentText as Record<string, unknown>).value === "string"
        ) {
          return (segmentText as Record<string, unknown>).value as string;
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

const getModelConfig = (forAiSearch = false) => {
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

  let model: string | undefined;
  let fallbackModel: string | undefined;

  if (forAiSearch) {
    // For AI Search, prefer AI_SEARCH model, fallback to general model
    model = envValue("LLM_MODEL_NAME_AI_SEARCH");
    fallbackModel = envValue(
      "LLM_MODEL_NAME",
      "LLM_MODEL",
      "AI_MODEL_NAME",
      "AI_MODEL",
      "OPENAI_MODEL_NAME",
      "OPENAI_MODEL",
      "MODEL"
    );
    // If no AI_SEARCH model specified, use general model
    if (!model) {
      model = fallbackModel;
      fallbackModel = envValue("LLM_MODEL_NAME_AI_SEARCH");
    }
  } else {
    // For general AI, use general model with AI_SEARCH as fallback
    model = envValue(
      "LLM_MODEL_NAME",
      "LLM_MODEL",
      "AI_MODEL_NAME",
      "AI_MODEL",
      "OPENAI_MODEL_NAME",
      "OPENAI_MODEL",
      "MODEL"
    );
    fallbackModel = envValue("LLM_MODEL_NAME_AI_SEARCH");
  }

  return { apiKey, apiBase, model, fallbackModel };
};

const isRateLimitError = (status: number, message: string): boolean =>
  status === 429 ||
  message.toLowerCase().includes("rate limit") ||
  message.toLowerCase().includes("too many requests");

router.post(
  "ai.search",
  auth(),
  validate(T.AiSearchSchema),
  async (ctx: APIContext<T.AiSearchReq>) => {
    const { user } = ctx.state.auth;
    const {
      query,
      collectionId,
      userId,
      documentId,
      dateFilter,
      statusFilter,
      maxDocuments,
      language,
    } = ctx.input.body;

    const { apiKey, apiBase, model, fallbackModel } = getModelConfig(true);

    if (!apiKey || !apiBase || !model) {
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    try {
      // Import models dynamically
      const { Document } = await import("@server/models");
      const { DocumentHelper } = await import(
        "@server/models/helpers/DocumentHelper"
      );
      const SearchHelper = (await import("@server/models/helpers/SearchHelper"))
        .default;

      // Search for relevant documents
      let documentIds = undefined;
      if (documentId) {
        const document = await Document.findByPk(documentId, {
          userId: user.id,
        });
        if (document) {
          documentIds = [
            documentId,
            ...(await document.findAllChildDocumentIds()),
          ];
        }
      }

      const searchOptions = {
        query,
        collectionId: collectionId || undefined,
        dateFilter: dateFilter || undefined,
        statusFilter: statusFilter || undefined,
        limit: maxDocuments,
        collaboratorIds: userId ? [userId] : undefined,
        documentIds,
      };

      Logger.info("utils", "AI search options", {
        searchOptions,
        userId: user.id,
      });

      const searchResults = await SearchHelper.searchForUser(
        user,
        searchOptions
      );

      Logger.info("utils", "AI search results", {
        resultCount: searchResults.results.length,
        total: searchResults.total,
      });

      if (!searchResults.results.length) {
        ctx.body = {
          data: {
            answer:
              "I couldn't find any relevant documents to answer your question. Please try a different search query or check if you have access to the documents you're looking for.",
            sources: [],
          },
        };
        return;
      }

      // Fetch full document content for top results
      const resultDocumentIds = searchResults.results.map(
        (r: { document: { id: string } }) => r.document.id
      );
      const documents = await Document.findAll({
        where: {
          id: resultDocumentIds,
          teamId: user.teamId,
        },
      });

      // Build context from search results
      const contextParts = documents.map((doc, index) => {
        const markdown = DocumentHelper.toMarkdown(doc);
        const result = searchResults.results[index];
        return `## Document ${index + 1}: ${doc.title}
Document ID: ${doc.id}
Collection: ${doc.collection?.name || "N/A"}
URL: ${doc.url}
${result.context ? `\nRelevant excerpt:\n${result.context}\n` : ""}
Full content:
${markdown}`;
      });

      const context = contextParts.join("\n\n---\n\n");

      // Build sources list
      const sources = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        url: doc.url,
        collectionId: doc.collectionId,
      }));

      // Generate AI answer
      const trimmedBase = apiBase.replace(/\/$/, "");
      const endpoint = /\/chat\/completions$/i.test(trimmedBase)
        ? trimmedBase
        : `${trimmedBase}/chat/completions`;

      // Determine the language instruction
      const languageInstruction = language
        ? `IMPORTANT: Answer in ${language === "zh_CN" || language === "zh-CN" ? "Chinese (Simplified)" : language === "zh_TW" || language === "zh-TW" ? "Chinese (Traditional)" : language.replace("_", "-")}. `
        : "";

      const systemPrompt = `You are a concise knowledge base assistant. Answer questions ONLY based on the provided documents.

CRITICAL RULES:
1. ${languageInstruction}Maximum 150 words - be extremely concise
2. ONLY use information from the provided documents - do not add external knowledge
3. If the documents don't contain the answer, clearly state "The provided documents don't contain information about this"
4. Use simple, clear language - avoid complex formatting
5. Reference documents using: [Document Title](doc-id)
6. Use bullet points for lists, but avoid tables and complex structures

The user's question is: "${query}"

Here are the relevant documents:

${context}`;

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: query,
        },
      ];

      let currentModel = model;

      const makeRequest = async (modelToUse: string) => {
        const requestBody = JSON.stringify({
          model: modelToUse,
          messages,
          stream: true,
        });

        Logger.info("utils", "AI Search LLM request", {
          model: modelToUse,
          endpoint,
          requestLength: requestBody.length,
          messageCount: messages.length,
          contextLength: context.length,
          query,
          userId: user.id,
        });

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: requestBody,
        });

        if (!response.ok) {
          const raw = await response.text();
          let payload: unknown = undefined;
          try {
            payload = raw ? JSON.parse(raw) : undefined;
          } catch (error) {
            const parseError =
              error instanceof Error ? error : new Error(String(error));
            Logger.error("Failed parsing AI provider response", parseError, {
              raw,
              model: modelToUse,
            });
          }

          const errorPayload = payload as {
            error?: { message?: string };
            message?: string;
          };

          const message =
            errorPayload?.error?.message ||
            errorPayload?.message ||
            `Request failed with status ${response.status}`;

          // Check if it's a rate limit error and we have a fallback model
          if (
            fallbackModel &&
            modelToUse !== fallbackModel &&
            isRateLimitError(response.status, message)
          ) {
            Logger.warn(
              `Rate limit hit for model ${modelToUse}, retrying with fallback model ${fallbackModel}`,
              {
                primaryModel: modelToUse,
                fallbackModel,
                status: response.status,
                userId: user.id,
              }
            );
            return { shouldRetry: true, error: message };
          }

          Logger.error("AI search request failed", new Error(message), {
            endpoint,
            status: response.status,
            payload,
            model: modelToUse,
            userId: user.id,
          });

          return { shouldRetry: false, error: message };
        }

        // Return the stream for the caller to handle
        return { shouldRetry: false, stream: response.body };
      };

      // Try with primary model
      let result = await makeRequest(currentModel);

      // Retry with fallback if needed
      if (result.shouldRetry && fallbackModel) {
        currentModel = fallbackModel;
        result = await makeRequest(currentModel);
      }

      if (result.error) {
        ctx.throw(InvalidRequestError(result.error));
      }

      if (!result.stream) {
        ctx.throw(InvalidRequestError("No stream returned from AI provider"));
      }

      // Set up SSE headers
      ctx.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send sources first
      ctx.res.write(
        `data: ${JSON.stringify({ type: "sources", sources })}\n\n`
      );

      // Stream the answer
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === "data: [DONE]") {
              continue;
            }

            if (trimmedLine.startsWith("data: ")) {
              const jsonStr = trimmedLine.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const delta =
                  parsed.choices?.[0]?.delta?.content ||
                  parsed.choices?.[0]?.text ||
                  "";

                if (delta) {
                  ctx.res.write(
                    `data: ${JSON.stringify({ type: "content", content: delta })}\n\n`
                  );
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        // Send completion event
        ctx.res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        ctx.res.end();

        Logger.info("utils", "AI Search streaming completed", {
          model: currentModel,
          sourceCount: sources.length,
          userId: user.id,
        });
      } catch (streamError) {
        Logger.error("Stream processing error", streamError as Error);
        ctx.res.write(
          `data: ${JSON.stringify({ type: "error", error: "Stream processing failed" })}\n\n`
        );
        ctx.res.end();
      }
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));
      Logger.error("AI search failed", wrappedError);
      ctx.throw(
        InvalidRequestError("Sorry, something went wrong during AI search")
      );
    }
  }
);

router.post(
  "ai.generate",
  auth(),
  validate(T.AiGenerateSchema),
  async (ctx: APIContext<T.AiGenerateReq>) => {
    const { user } = ctx.state.auth;
    const prompt = trim(ctx.input.body.prompt ?? "");
    const context = trim(ctx.input.body.context ?? "");
    const mentionedDocumentIds = ctx.input.body.mentionedDocumentIds ?? [];

    if (!prompt) {
      ctx.throw(InvalidRequestError("Prompt is required"));
    }

    const { apiKey, apiBase, model, fallbackModel } = getModelConfig(false);

    if (!apiKey || !apiBase || !model) {
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    try {
      let instructions =
        "You write Markdown for the Outline editor. " +
        "Always emit valid Markdown that renders correctly, and never wrap all output in triple backticks unless required. " +
        "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text.";

      // Fetch mentioned documents and add them to the system prompt
      if (mentionedDocumentIds.length > 0) {
        const { Document } = await import("@server/models");
        const { DocumentHelper } = await import(
          "@server/models/helpers/DocumentHelper"
        );

        const documents = await Document.findAll({
          where: {
            id: mentionedDocumentIds,
            teamId: user.teamId,
          },
        });

        if (documents.length > 0) {
          const mentionedContent = documents
            .map((doc) => {
              const markdown = DocumentHelper.toMarkdown(doc);
              return `## Referenced Document: ${doc.title}\n\n${markdown}`;
            })
            .join("\n\n---\n\n");

          instructions += `\n\nThe user has mentioned the following documents for reference:\n\n${mentionedContent}`;
        }
      }

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

      let currentModel = model;

      const makeRequest = async (modelToUse: string) => {
        const requestBody = JSON.stringify({
          model: modelToUse,
          messages,
        });

        Logger.info("utils", "AI Generate LLM request", {
          model: modelToUse,
          endpoint,
          requestLength: requestBody.length,
          messageCount: messages.length,
          promptLength: prompt.length,
          contextLength: context.length,
          mentionedDocumentCount: mentionedDocumentIds.length,
          userId: user.id,
        });

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: requestBody,
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
            model: modelToUse,
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

          // Check if it's a rate limit error and we have a fallback model
          if (
            fallbackModel &&
            modelToUse !== fallbackModel &&
            isRateLimitError(response.status, message)
          ) {
            Logger.warn(
              `Rate limit hit for model ${modelToUse}, retrying with fallback model ${fallbackModel}`,
              {
                primaryModel: modelToUse,
                fallbackModel,
                status: response.status,
                userId: user.id,
              }
            );
            return { shouldRetry: true, error: message };
          }

          Logger.error("AI provider request failed", new Error(message), {
            endpoint,
            status: response.status,
            payload,
            model: modelToUse,
            userId: user.id,
          });

          return { shouldRetry: false, error: message };
        }

        const responseBody = payload as {
          choices?: ChatCompletionChoice[];
        };

        if (!responseBody?.choices?.length) {
          Logger.error(
            "AI generate returned empty response",
            new Error("No choices"),
            {
              model: modelToUse,
              userId: user.id,
            }
          );
          return {
            shouldRetry: false,
            error: "AI provider returned an empty response",
          };
        }

        const normalized = parseAiResponse(responseBody.choices[0])
          .replace(/\r/g, "")
          .trim();

        if (!normalized) {
          Logger.error(
            "AI generate returned empty text",
            new Error("Empty text"),
            {
              model: modelToUse,
              userId: user.id,
            }
          );
          return {
            shouldRetry: false,
            error: "AI provider returned an empty response",
          };
        }

        Logger.info("utils", "AI Generate LLM response", {
          model: modelToUse,
          responseLength: normalized.length,
          userId: user.id,
        });

        return { shouldRetry: false, text: normalized };
      };

      // Try with primary model
      let result = await makeRequest(currentModel);

      // Retry with fallback if needed
      if (result.shouldRetry && fallbackModel) {
        currentModel = fallbackModel;
        result = await makeRequest(currentModel);
      }

      if (result.error) {
        ctx.throw(InvalidRequestError(result.error));
      }

      ctx.body = {
        data: {
          text: result.text,
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
