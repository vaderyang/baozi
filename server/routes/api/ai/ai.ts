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

type ChatMessagePayload = {
  role: string;
  content: string;
};

type AiPromptMode = "fast" | "sensitive" | "vision";

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

const getModelConfig = async (
  forAiSearch = false,
  teamId?: string,
  contextLength?: number
) => {
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
  let contextLengthThreshold = 500;

  // Load team preferences if teamId is provided
  if (teamId) {
    const { Team } = await import("@server/models");
    const { TeamPreference } = await import("@shared/types");
    const team = await Team.findByPk(teamId);

    if (team) {
      if (forAiSearch) {
        // Get AI Search models from preferences (no context-length switching for search)
        const searchModel = team.getPreference(TeamPreference.AiSearchModel);
        const searchFallbackModel = team.getPreference(
          TeamPreference.AiSearchFallbackModel
        );

        model =
          (typeof searchModel === "string" ? searchModel : undefined) ||
          envValue("LLM_MODEL_NAME_AI_SEARCH");
        fallbackModel =
          (typeof searchFallbackModel === "string"
            ? searchFallbackModel
            : undefined) ||
          envValue(
            "LLM_MODEL_NAME",
            "LLM_MODEL",
            "AI_MODEL_NAME",
            "AI_MODEL",
            "OPENAI_MODEL_NAME",
            "OPENAI_MODEL",
            "MODEL"
          );
      } else {
        // Get context length threshold from preferences (only for text generation)
        const thresholdPref = team.getPreference(
          TeamPreference.AiContextLengthThreshold
        );
        if (typeof thresholdPref === "number") {
          contextLengthThreshold = thresholdPref;
        }

        // Get AI Generate Text models from preferences
        const generateModel = team.getPreference(
          TeamPreference.AiGenerateTextModel
        );
        const generateFallbackModel = team.getPreference(
          TeamPreference.AiGenerateTextFallbackModel
        );

        model =
          (typeof generateModel === "string" ? generateModel : undefined) ||
          envValue(
            "LLM_MODEL_NAME",
            "LLM_MODEL",
            "AI_MODEL_NAME",
            "AI_MODEL",
            "OPENAI_MODEL_NAME",
            "OPENAI_MODEL",
            "MODEL"
          );
        fallbackModel =
          (typeof generateFallbackModel === "string"
            ? generateFallbackModel
            : undefined) || envValue("LLM_MODEL_NAME_AI_SEARCH");
      }
    }
  }

  // Fallback to environment variables if no team preferences
  if (!model) {
    if (forAiSearch) {
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
      if (!model) {
        model = fallbackModel;
        fallbackModel = envValue("LLM_MODEL_NAME_AI_SEARCH");
      }
    } else {
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
  }

  // Apply context-length-based model switching ONLY for text generation (not AI Search)
  if (
    !forAiSearch &&
    contextLength !== undefined &&
    contextLength < contextLengthThreshold &&
    fallbackModel
  ) {
    Logger.info("utils", "Using fallback model for short context", {
      contextLength,
      threshold: contextLengthThreshold,
      primaryModel: model,
      fallbackModel,
    });
    // Swap models: use fallback for short contexts
    const temp = model;
    model = fallbackModel;
    fallbackModel = temp;
  }

  return { apiKey, apiBase, model, fallbackModel };
};

const isRateLimitError = (status: number, message: string): boolean =>
  status === 429 ||
  message.toLowerCase().includes("rate limit") ||
  message.toLowerCase().includes("too many requests");

const isContextWindowError = (status: number, message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  return (
    status === 400 &&
    (lowerMessage.includes("context_length_exceeded") ||
      lowerMessage.includes("maximum context length") ||
      lowerMessage.includes("context window") ||
      lowerMessage.includes("context length") ||
      lowerMessage.includes("token limit") ||
      lowerMessage.includes("tokens limit") ||
      lowerMessage.includes("too many tokens") ||
      lowerMessage.includes("max tokens"))
  );
};

const shouldRetryWithFallback = (status: number, message: string): boolean =>
  isRateLimitError(status, message) ||
  isContextWindowError(status, message) ||
  status === 503 ||
  status === 500 ||
  message.toLowerCase().includes("service unavailable") ||
  message.toLowerCase().includes("no server is available") ||
  message.toLowerCase().includes("serviceunavailableerror");

/**
 * Removes transcript code blocks from markdown content to reduce token usage.
 * Transcripts are typically formatted as:
 * ## Transcript
 * ```
 * <transcript text>
 * ```
 *
 * This function strips out the code block content while preserving the heading
 * to indicate that a transcript exists.
 */
const stripTranscriptCodeBlocks = (markdown: string): string => {
  // Match heading with "transcript" (case-insensitive) followed by a code block
  // Pattern: ## Transcript\n\n```\n<content>\n```
  const transcriptPattern =
    /^(#{1,6}\s+[^#\n]*transcript[^\n]*)\n+```[^\n]*\n[\s\S]*?```/gim;

  // Replace transcript code blocks with just the heading and a placeholder
  return markdown.replace(
    transcriptPattern,
    "$1\n\n[Transcript content omitted for brevity]"
  );
};

/**
 * Extract keywords from a natural language query using LLM
 */
const extractKeywords = async (
  query: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string> => {
  const trimmedBase = apiBase.replace(/\/$/, "");
  const endpoint = /\/chat\/completions$/i.test(trimmedBase)
    ? trimmedBase
    : `${trimmedBase}/chat/completions`;

  const systemPrompt = `You are a keyword extraction assistant. Extract the most important keywords from the user's question for document search.

RULES:
1. Extract 1-5 key terms that would be most useful for searching documents
2. Focus on nouns, technical terms, and specific concepts
3. Remove question words (what, how, why, when, where, who)
4. Remove common words (is, the, a, an, of, in, on, at)
5. Keep technical abbreviations and acronyms (e.g., FTP, API, HTTP)
6. Return ONLY the keywords separated by spaces, no explanation

Examples:
- "什么是FTP" → "FTP"
- "How does authentication work?" → "authentication"
- "What is the difference between REST and GraphQL?" → "REST GraphQL difference"
- "如何配置数据库连接" → "配置 数据库 连接"`;

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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      Logger.warn("Keyword extraction failed, using original query", {
        status: response.status,
        query,
      });
      return query;
    }

    const data = (await response.json()) as {
      choices?: ChatCompletionChoice[];
    };
    const keywords = parseAiResponse(data.choices?.[0] || {}).trim();

    Logger.info("utils", "Keywords extracted", {
      originalQuery: query,
      extractedKeywords: keywords,
    });

    return keywords || query;
  } catch (error) {
    const wrappedError =
      error instanceof Error ? error : new Error(String(error));
    Logger.warn("Keyword extraction error, using original query", wrappedError);
    return query;
  }
};

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

    // Get initial model config for keyword extraction (without context length)
    const initialConfig = await getModelConfig(true, user.teamId);
    let apiKey = initialConfig.apiKey;
    let apiBase = initialConfig.apiBase;
    let model = initialConfig.model;
    let fallbackModel = initialConfig.fallbackModel;

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

      // Extract keywords from the natural language query
      const searchKeywords = await extractKeywords(
        query,
        apiKey,
        apiBase,
        model
      );

      // Search for relevant documents using extracted keywords
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
        query: searchKeywords, // Use extracted keywords for search
        collectionId: collectionId || undefined,
        dateFilter: dateFilter || undefined,
        statusFilter: statusFilter || undefined,
        limit: maxDocuments,
        collaboratorIds: userId ? [userId] : undefined,
        documentIds,
      };

      Logger.info("utils", "AI search options", {
        originalQuery: query,
        searchKeywords,
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
        // Strip transcript code blocks to reduce token usage for AI Search
        const strippedMarkdown = stripTranscriptCodeBlocks(markdown);
        const result = searchResults.results[index];

        // Log if transcript content was stripped
        const charsReduced = markdown.length - strippedMarkdown.length;
        if (charsReduced > 0) {
          Logger.info(
            "utils",
            "Stripped transcript from document for AI Search",
            {
              documentId: doc.id,
              documentTitle: doc.title,
              originalLength: markdown.length,
              strippedLength: strippedMarkdown.length,
              charsReduced,
              reductionPercent: (
                (charsReduced / markdown.length) *
                100
              ).toFixed(1),
              userId: user.id,
            }
          );
        }

        return `## Document ${index + 1}: ${doc.title}
Document ID: ${doc.id}
Collection: ${doc.collection?.name || "N/A"}
URL: ${doc.url}
${result.context ? `\nRelevant excerpt:\n${result.context}\n` : ""}
Full content:
${strippedMarkdown}`;
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

Here are the relevant documents:

${context}`;

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: query, // Use original user question, not extracted keywords
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

          // Check if we should retry with fallback model
          if (
            fallbackModel &&
            modelToUse !== fallbackModel &&
            shouldRetryWithFallback(response.status, message)
          ) {
            Logger.warn(
              `Model ${modelToUse} failed (status ${response.status}), retrying with fallback model ${fallbackModel}`,
              {
                primaryModel: modelToUse,
                fallbackModel,
                status: response.status,
                message,
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

      // Tell Koa we're handling the response manually
      ctx.respond = false;

      // Set status code
      ctx.status = 200;

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
    const mode = (ctx.input.body.mode ?? "fast") as AiPromptMode;

    if (!prompt) {
      ctx.throw(InvalidRequestError("Prompt is required"));
    }

    // Calculate context length for model selection
    const totalContextLength = prompt.length + context.length;

    const { apiKey, apiBase, model, fallbackModel } = await getModelConfig(
      false,
      user.teamId,
      totalContextLength
    );

    if (!apiKey || !apiBase || !model) {
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    try {
      let instructions =
        "You write Markdown Text upon user's request" +
        "Always emit valid Markdown that renders correctly. " +
        "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
        "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text." +
        "If writing a meeting minutes or so, be professional thinking the sections and the format.";

      let referencedDocumentsText = "";
      const visionImageUrls: string[] = [];

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
          let textHelperModule:
            | typeof import("@server/models/helpers/TextHelper")
            | undefined;
          let parseImages:
            | typeof import("@server/utils/parseImages").default
            | undefined;

          if (mode === "vision") {
            textHelperModule = await import(
              "@server/models/helpers/TextHelper"
            );
            parseImages = (await import("@server/utils/parseImages")).default;
          }

          const mentionedSections = await Promise.all(
            documents.map(async (doc) => {
              let markdown = DocumentHelper.toMarkdown(doc);

              if (mode === "vision" && textHelperModule && parseImages) {
                markdown =
                  await textHelperModule.TextHelper.attachmentsToSignedUrls(
                    markdown,
                    user.teamId,
                    600
                  );

                const images = parseImages(markdown).map((img) => img.src);
                visionImageUrls.push(...images);
              }

              return `## Referenced Document: ${doc.title}\n\n${markdown}`;
            })
          );

          referencedDocumentsText = mentionedSections.join("\n\n---\n\n");

          if (referencedDocumentsText && mode !== "vision") {
            instructions += `\n\nThe user has mentioned the following documents for reference:\n\n${referencedDocumentsText}`;
          }
        }
      }

      const uniqueVisionImages =
        mode === "vision"
          ? Array.from(
              new Set(
                visionImageUrls
                  .map((url) => url?.trim())
                  .filter((url): url is string => !!url)
              )
            )
          : [];

      const visionImages =
        mode === "vision"
          ? uniqueVisionImages.filter((url) => {
              if (!url) {
                return false;
              }
              if (
                url.startsWith("http://") ||
                url.startsWith("https://") ||
                url.startsWith("data:") ||
                url.startsWith("blob:")
              ) {
                return true;
              }
              Logger.warn("Skipping unsupported vision image URL", {
                url,
                reason:
                  "Only http(s)/data/blob URLs are supported for vision mode",
              });
              return false;
            })
          : [];

      const visionImagePayloads =
        mode === "vision"
          ? await Promise.all(
              visionImages.map(async (url) => {
                try {
                  if (url.startsWith("data:")) {
                    const base64Index = url.indexOf("base64,");
                    if (base64Index === -1) {
                      Logger.warn(
                        "Skipping malformed data URL for vision mode",
                        {
                          url,
                        }
                      );
                      return null;
                    }
                    const meta = url.slice(5, base64Index);
                    const mimeType = meta.split(";")[0] || "image/png";
                    const base64Data = url.slice(base64Index + 7);

                    return {
                      type: mimeType ?? "image/png",
                      data: base64Data,
                    };
                  }

                  if (url.startsWith("blob:")) {
                    Logger.warn("Skipping blob URL for vision mode", {
                      url,
                      reason: "Server cannot resolve blob URLs",
                    });
                    return null;
                  }

                  const response = await fetch(url, {
                    method: "GET",
                  });

                  if (!response.ok) {
                    Logger.warn("Failed fetching vision image", {
                      url,
                      status: response.status,
                    });
                    return null;
                  }

                  const contentType =
                    response.headers.get("content-type") ?? "image/png";
                  if (!contentType.startsWith("image/")) {
                    Logger.warn("Skipping non-image content for vision mode", {
                      url,
                      contentType,
                    });
                    return null;
                  }

                  const buffer = Buffer.from(await response.arrayBuffer());
                  const base64Data = buffer.toString("base64");

                  return {
                    type: contentType,
                    data: base64Data,
                  };
                } catch (error) {
                  Logger.warn(
                    "Failed converting vision image to base64",
                    error,
                    {
                      url,
                    }
                  );
                  return null;
                }
              })
            ).then((results) =>
              results.filter(
                (item): item is { type: string; data: string } => !!item
              )
            )
          : [];

      const userPrompt =
        (mode === "vision" && referencedDocumentsText
          ? `Referenced documents for context:\n\n${referencedDocumentsText}\n\n---\n\n`
          : "") + prompt;

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
          content: userPrompt,
        },
      ].filter(Boolean) as ChatMessagePayload[];

      const sensitiveModel =
        envValue(
          "LLM_MODEL_NAME_SENSITIVE",
          "LLM_MODEL_NAME_AI_SEARCH",
          "AI_SEARCH_MODEL",
          "AI_MODEL_NAME_SEARCH"
        ) ??
        fallbackModel ??
        "qwen3-30b-a3b-instruct";

      // Get vision model from team preferences or environment
      let visionModel: string | undefined;
      const { Team } = await import("@server/models");
      const { TeamPreference } = await import("@shared/types");
      const team = await Team.findByPk(user.teamId);
      if (team) {
        const visionModelPref = team.getPreference(
          TeamPreference.AiVisionModel
        );
        visionModel =
          typeof visionModelPref === "string" ? visionModelPref : undefined;
      }
      if (!visionModel) {
        visionModel =
          envValue(
            "LLM_MODEL_NAME_VISION",
            "AI_VISION_MODEL",
            "VISION_MODEL"
          ) ?? "grok-4-fast-non-reasoning";
      }

      let currentModel = model;
      let activeFallbackModel = fallbackModel;

      if (mode === "sensitive") {
        currentModel = sensitiveModel;
        activeFallbackModel =
          currentModel === model ? fallbackModel : (model ?? fallbackModel);
        if (activeFallbackModel === currentModel) {
          activeFallbackModel = undefined;
        }
      } else if (mode === "vision") {
        currentModel = visionModel;
        activeFallbackModel = undefined;
      }

      if (!currentModel) {
        ctx.throw(InvalidRequestError("AI model configuration is incomplete"));
      }

      const makeRequest = async (modelToUse: string) => {
        const requestPayload: Record<string, unknown> = {
          model: modelToUse,
          messages,
        };

        if (mode === "vision" && visionImagePayloads.length) {
          requestPayload.images = visionImagePayloads;
          requestPayload.max_tokens = 512;
          requestPayload.temperature = 0.7;
        }

        const requestBody = JSON.stringify(requestPayload);

        if (mode === "vision") {
          Logger.info("utils", "Vision LLM request payload", {
            endpoint,
            model: modelToUse,
            payload: requestPayload,
          });
        }

        Logger.info("utils", "AI Generate LLM request", {
          model: modelToUse,
          endpoint,
          requestLength: requestBody.length,
          messageCount: messages.length,
          promptLength: prompt.length,
          contextLength: context.length,
          mentionedDocumentCount: mentionedDocumentIds.length,
          mode,
          visionImageCount: visionImagePayloads.length,
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

          // Check if we should retry with fallback model
          if (
            activeFallbackModel &&
            modelToUse !== activeFallbackModel &&
            shouldRetryWithFallback(response.status, message)
          ) {
            Logger.warn(
              `Model ${modelToUse} failed (status ${response.status}), retrying with fallback model ${activeFallbackModel}`,
              {
                primaryModel: modelToUse,
                fallbackModel: activeFallbackModel,
                status: response.status,
                message,
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
          mode,
          visionImageCount: visionImagePayloads.length,
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
