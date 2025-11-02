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

        Logger.error("AI search request failed", new Error(message), {
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

      const answer = parseAiResponse(responseBody.choices[0])
        .replace(/\r/g, "")
        .trim();

      if (!answer) {
        ctx.throw(
          InvalidRequestError("AI provider returned an empty response")
        );
      }

      ctx.body = {
        data: {
          answer,
          sources,
        },
      };
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
