import Router from "koa-router";
import trim from "lodash/trim";
import env from "@server/env";
import { InvalidRequestError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { APIContext } from "@server/types";
import { DateFilter, StatusFilter } from "@shared/types";
import * as T from "./schema";

const router = new Router();

type ModelInfo = {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
};

router.post("ai.models", auth(), async (ctx: APIContext) => {
  const { user } = ctx.state.auth;

  // Check if user has permission to view AI settings
  // Only admins can configure AI settings
  if (user.role !== "admin") {
    ctx.throw(403, "Admin access required");
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

  if (!apiKey || !apiBase) {
    ctx.throw(
      InvalidRequestError("AI API configuration not found in environment")
    );
  }

  try {
    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = `${trimmedBase}/v1/models`;

    Logger.info("utils", "Fetching AI models", {
      endpoint,
      userId: user.id,
    });

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(
        "Failed to fetch AI models",
        new Error(`${response.status}: ${errorText}`),
        {
          endpoint,
          status: response.status,
          userId: user.id,
        }
      );
      ctx.throw(
        InvalidRequestError(
          `Failed to fetch models: ${response.status} ${response.statusText}`
        )
      );
    }

    const data = (await response.json()) as {
      data?: ModelInfo[];
      object?: string;
    };

    if (data.data && Array.isArray(data.data)) {
      const models = data.data
        .map((model) => ({
          id: model.id,
          object: model.object,
          created: model.created,
          owned_by: model.owned_by,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      Logger.info("utils", "AI models fetched successfully", {
        count: models.length,
        userId: user.id,
      });

      ctx.body = {
        data: {
          models,
        },
      };
    } else {
      Logger.error(
        "Invalid response format from models API",
        new Error("Missing data array"),
        {
          endpoint,
          responseKeys: Object.keys(data),
          userId: user.id,
        }
      );
      ctx.throw(InvalidRequestError("Invalid response format from models API"));
    }
  } catch (error: unknown) {
    const wrappedError =
      error instanceof Error ? error : new Error(String(error));
    Logger.error("Failed to fetch AI models", wrappedError, {
      userId: user.id,
    });
    throw error;
  }
});

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
  Logger.info("utils", "getModelConfig called", {
    forAiSearch,
    teamId,
    contextLength,
  });

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

  Logger.info("utils", "Environment config loaded", {
    hasApiKey: !!apiKey,
    hasApiBase: !!apiBase,
    apiBase: apiBase ? apiBase.substring(0, 30) + "..." : undefined,
  });

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

  Logger.info("utils", "getModelConfig result", {
    forAiSearch,
    model,
    fallbackModel,
    hasApiKey: !!apiKey,
    hasApiBase: !!apiBase,
  });

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
 * Detect if a query contains Chinese characters
 */
const containsChinese = (text: string): boolean => /[\u4e00-\u9fa5]/.test(text);

/**
 * Extract individual keywords from a natural language query using LLM
 * Returns an array of individual words (not multi-word phrases)
 */
const extractKeywords = async (
  query: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string[]> => {
  const trimmedBase = apiBase.replace(/\/$/, "");
  const endpoint = /\/chat\/completions$/i.test(trimmedBase)
    ? trimmedBase
    : `${trimmedBase}/chat/completions`;

  // Detect language for better keyword extraction
  const isChinese = containsChinese(query);
  const languageNote = isChinese
    ? "The query is in Chinese. Extract Chinese keywords as individual words/characters."
    : "The query is in English. Extract English keywords as individual words.";

  const systemPrompt = `You are a keyword extraction assistant. Extract INDIVIDUAL WORDS (NOT multi-word phrases) from the user's question for document search.

CRITICAL RULES - SINGLE WORDS ONLY:
1. Extract 1-5 INDIVIDUAL WORDS (NOT phrases, NOT multi-word terms)
2. Each keyword MUST be a SINGLE WORD - no spaces within keywords
3. Focus on nouns, technical terms, and specific concepts
4. Remove question words (what, how, why, when, where, who)
5. Remove common words (is, the, a, an, of, in, on, at, for, with, to)
6. Keep technical abbreviations and acronyms as single words (e.g., FTP, API, HTTP)
7. Return ONLY the individual words separated by spaces, no explanation, no numbering

${languageNote}

CORRECT Examples (SINGLE WORDS):
- "什么是FTP" → "FTP"
- "How does authentication work?" → "authentication"
- "What is the difference between REST and GraphQL?" → "REST GraphQL"
- "如何配置数据库连接" → "配置 数据库 连接"
- "How to set up user authentication?" → "user authentication setup"

WRONG Examples (multi-word phrases - DO NOT DO THIS):
- "user authentication" (WRONG - this is a phrase)
- "database connection" (WRONG - this is a phrase)
- "REST API" (WRONG - this is a phrase)

Remember: Extract ONLY individual words, NOT phrases!`;

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

  const startTime = Date.now();

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

    const extractionTime = Date.now() - startTime;

    if (!response.ok) {
      Logger.warn(
        "Keyword extraction failed, using original query as fallback",
        {
          status: response.status,
          query,
          extractionTime,
          fallbackUsed: true,
        }
      );
      // Fallback: use original query as single keyword
      return [query];
    }

    const data = (await response.json()) as {
      choices?: ChatCompletionChoice[];
    };
    const keywordsText = parseAiResponse(data.choices?.[0] || {}).trim();

    // Parse LLM response and split by whitespace into array
    const keywords = keywordsText
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0)
      .slice(0, 5); // Limit to 5 keywords maximum

    // Log extracted keywords for monitoring (Task 9.1)
    Logger.info("utils", "Individual keywords extracted", {
      originalQuery: query,
      extractedKeywords: keywords,
      keywordCount: keywords.length,
      extractionTime,
      isChinese,
      rawResponse: keywordsText,
      fallbackUsed: false,
    });

    // Fallback if no keywords extracted
    if (keywords.length === 0) {
      Logger.warn(
        "Keyword extraction returned empty array, using original query as fallback",
        {
          query,
          rawResponse: keywordsText,
          extractionTime,
          fallbackUsed: true,
        }
      );
      return [query];
    }

    return keywords;
  } catch (error) {
    const extractionTime = Date.now() - startTime;
    const wrappedError =
      error instanceof Error ? error : new Error(String(error));
    Logger.warn("Keyword extraction error, using original query as fallback", {
      query,
      error: wrappedError.message,
      extractionTime,
      fallbackUsed: true,
    });
    // Fallback: use original query as single keyword
    return [query];
  }
};

/**
 * Execute parallel searches for multiple keywords and merge results
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SearchWithMultipleKeywordsOptions {
  collectionId?: string;
  userId?: string;
  documentId?: string;
  dateFilter?: DateFilter;
  statusFilter?: StatusFilter[];
  maxDocuments?: number;
  collaboratorIds?: string[];
  documentIds?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface MergedSearchResult {
  document: unknown;
  relevanceScore: number;
  matchedKeywords: string[];
  context: string;
  ranking: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const searchWithMultipleKeywords = async (
  keywords: string[],
  user: { id: string; teamId: string; [key: string]: unknown },
  searchOptions: SearchWithMultipleKeywordsOptions,
  onProgress?: (keyword: string, resultCount: number) => void
): Promise<MergedSearchResult[]> => {
  const SearchHelper = (await import("@server/models/helpers/SearchHelper"))
    .default;

  // Get configuration from environment
  const maxResultsPerKeyword = parseInt(
    process.env.AI_ASK_RESULTS_PER_KEYWORD || "10",
    10
  );

  const userId = user.id;
  const teamId = user.teamId;

  Logger.info("utils", "Starting parallel keyword searches", {
    keywords,
    keywordCount: keywords.length,
    maxResultsPerKeyword,
    userId,
    teamId,
  });

  const parallelSearchStartTime = Date.now();

  // Execute searches in parallel with individual error handling
  const searchPromises = keywords.map(async (keyword) => {
    const keywordSearchStartTime = Date.now();

    try {
      const results = await SearchHelper.searchForUser(user as never, {
        ...searchOptions,
        query: keyword,
        limit: maxResultsPerKeyword,
      });

      const keywordSearchTime = Date.now() - keywordSearchStartTime;

      // Log each keyword search with result count (Task 9.2)
      Logger.info("utils", "Keyword search completed", {
        keyword,
        resultCount: results.results.length,
        searchTime: keywordSearchTime,
        userId,
      });

      // Emit progress event
      if (onProgress) {
        onProgress(keyword, results.results.length);
      }

      return {
        keyword,
        results: results.results,
        success: true,
        searchTime: keywordSearchTime,
      };
    } catch (error) {
      const keywordSearchTime = Date.now() - keywordSearchStartTime;
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));
      Logger.warn("Keyword search failed, continuing with other searches", {
        keyword,
        error: wrappedError.message,
        searchTime: keywordSearchTime,
        userId,
      });

      // Emit progress event with zero results
      if (onProgress) {
        onProgress(keyword, 0);
      }

      return {
        keyword,
        results: [],
        success: false,
        searchTime: keywordSearchTime,
      };
    }
  });

  const allSearchResults = await Promise.all(searchPromises);

  // Log parallel search execution time (Task 9.2)
  const parallelSearchTime = Date.now() - parallelSearchStartTime;

  // Log any failed searches
  const failedSearches = allSearchResults.filter((r) => !r.success);
  const successfulSearches = allSearchResults.filter((r) => r.success);

  if (failedSearches.length > 0) {
    Logger.warn(
      "Some keyword searches failed, continuing with successful searches",
      {
        failedKeywords: failedSearches.map((r) => r.keyword),
        failedCount: failedSearches.length,
        successfulCount: successfulSearches.length,
        totalCount: keywords.length,
        failureRate: `${((failedSearches.length / keywords.length) * 100).toFixed(1)}%`,
        userId,
      }
    );
  }

  // Check if too many searches failed (more than 50%)
  if (failedSearches.length > keywords.length / 2) {
    Logger.error(
      "Majority of keyword searches failed",
      new Error("Partial search failure"),
      {
        failedKeywords: failedSearches.map((r) => r.keyword),
        failedCount: failedSearches.length,
        successfulCount: successfulSearches.length,
        totalCount: keywords.length,
        userId,
      }
    );
  }

  // Calculate keyword specificity weights
  // Keywords with fewer results are more specific and get higher weights
  // This boosts results for specific terms like "回放测试" over generic terms like "进展"
  const keywordWeights = new Map<string, number>();
  const maxResults = Math.max(
    ...allSearchResults.map((r) => r.results.length),
    1
  );

  for (const { keyword, results } of allSearchResults) {
    // Specificity weight: inverse of result count normalized
    // Fewer results = higher weight (more specific)
    // More results = lower weight (more generic)
    const resultCount = results.length || 1;
    const specificity = maxResults / resultCount;

    // Apply logarithmic scaling to prevent extreme weights
    // This ensures specific keywords are boosted but not overwhelming
    const weight = 1 + Math.log(specificity);
    keywordWeights.set(keyword, weight);

    Logger.info("utils", "Keyword specificity calculated", {
      keyword,
      resultCount,
      specificity: specificity.toFixed(2),
      weight: weight.toFixed(2),
      interpretation:
        weight > 1.5
          ? "specific/rare term (high weight)"
          : "common term (lower weight)",
    });
  }

  // Merge and deduplicate results with weighted scoring
  const mergingStartTime = Date.now();
  const documentMap = new Map<string, MergedSearchResult>();

  for (const { keyword, results } of allSearchResults) {
    const keywordWeight = keywordWeights.get(keyword) || 1.0;

    for (const result of results) {
      const docId = (result.document as { id: string }).id;

      // Apply keyword weight to ranking score
      const weightedScore = result.ranking * keywordWeight;

      if (documentMap.has(docId)) {
        // Document found in multiple searches - boost relevance
        const existing = documentMap.get(docId)!;
        existing.relevanceScore += weightedScore;
        existing.matchedKeywords.push(keyword);

        // Additional boost for matching multiple keywords (co-occurrence boost)
        // Documents matching multiple specific keywords are highly relevant
        const multiKeywordBoost = existing.matchedKeywords.length * 0.5;
        existing.relevanceScore += multiKeywordBoost;

        // Log documents matching multiple keywords (Task 9.2)
        Logger.info("utils", "Document matched multiple keywords", {
          documentId: docId,
          keyword,
          keywordWeight: keywordWeight.toFixed(2),
          weightedScore: weightedScore.toFixed(2),
          multiKeywordBoost: multiKeywordBoost.toFixed(2),
          newRelevanceScore: existing.relevanceScore.toFixed(2),
          matchedKeywords: existing.matchedKeywords,
          matchCount: existing.matchedKeywords.length,
        });
      } else {
        // New document
        documentMap.set(docId, {
          document: result.document,
          relevanceScore: weightedScore,
          matchedKeywords: [keyword],
          context: result.context || "",
          ranking: result.ranking,
        });
      }
    }
  }

  // Sort by combined relevance score and limit results
  const maxFinalResults = parseInt(
    process.env.AI_ASK_MAX_DOCUMENTS || "20",
    10
  );

  const mergedResults = Array.from(documentMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxFinalResults);

  const mergingTime = Date.now() - mergingStartTime;

  // Log result merging time and final document count (Task 9.2)
  Logger.info("utils", "Parallel search merge complete", {
    keywords,
    totalSearches: allSearchResults.length,
    successfulSearches: allSearchResults.filter((r) => r.success).length,
    uniqueDocuments: documentMap.size,
    finalResultCount: mergedResults.length,
    multiKeywordMatches: mergedResults.filter(
      (r) => r.matchedKeywords.length > 1
    ).length,
    parallelSearchTime,
    mergingTime,
    totalSearchAndMergeTime: parallelSearchTime + mergingTime,
    userId,
    teamId,
  });

  return mergedResults;
};

/**
 * Generate follow-up questions based on the conversation context
 */
const generateFollowups = async (
  query: string,
  answer: string,
  sources: Array<{ id: string; title: string }>,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string[]> => {
  const trimmedBase = apiBase.replace(/\/$/, "");
  const endpoint = /\/chat\/completions$/i.test(trimmedBase)
    ? trimmedBase
    : `${trimmedBase}/chat/completions`;

  const systemPrompt = `You are a follow-up question generator. Based on the user's question and the AI answer, generate 3-5 relevant follow-up questions that the user might want to ask next.

RULES:
1. Generate 3-5 questions that naturally follow from the conversation
2. Questions should be specific and actionable
3. Questions should explore different aspects or go deeper into the topic
4. Keep questions concise (under 100 characters each)
5. Return ONLY the questions, one per line, no numbering or explanation
6. Questions should be in the same language as the original query

Context:
User Question: ${query}
AI Answer: ${answer}
Referenced Documents: ${sources.map((s) => s.title).join(", ")}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      Logger.warn("Follow-up generation failed", {
        status: response.status,
        query,
      });
      return [];
    }

    const data = (await response.json()) as {
      choices?: ChatCompletionChoice[];
    };
    const followupsText = parseAiResponse(data.choices?.[0] || {}).trim();

    const followups = followupsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length <= 100)
      .slice(0, 5);

    Logger.info("utils", "Follow-ups generated", {
      originalQuery: query,
      followupCount: followups.length,
    });

    return followups;
  } catch (error) {
    const wrappedError =
      error instanceof Error ? error : new Error(String(error));
    Logger.warn("Follow-up generation error", wrappedError);
    return [];
  }
};

router.post(
  "ai.ask",
  auth(),
  validate(T.AiAskSchema),
  async (ctx: APIContext<T.AiAskReq>) => {
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
      conversationHistory,
    } = ctx.input.body;

    // Get initial model config for keyword extraction
    const initialConfig = await getModelConfig(true, user.teamId);
    let apiKey = initialConfig.apiKey;
    let apiBase = initialConfig.apiBase;
    let model = initialConfig.model;
    let fallbackModel = initialConfig.fallbackModel;

    if (!apiKey || !apiBase || !model) {
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    // Set up SSE response headers early, before any writes
    ctx.respond = false;
    ctx.res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    Logger.info("utils", "AI Ask SSE headers sent", {
      userId: user.id,
      statusCode: ctx.res.statusCode,
    });

    try {
      // Import models dynamically
      const { Document } = await import("@server/models");
      const { DocumentHelper } = await import(
        "@server/models/helpers/DocumentHelper"
      );

      // Build conversation context for better search
      let contextualQuery = query;
      let firstQueryKeywords: string[] = [];

      if (conversationHistory && conversationHistory.length > 0) {
        // CRITICAL: Preserve the first query's intent keywords
        // This prevents the conversation from drifting off-topic in multi-turn dialogs
        const firstQuery = conversationHistory[0].question;

        // Extract keywords from first query to preserve core topic
        try {
          firstQueryKeywords = await extractKeywords(
            firstQuery,
            apiKey,
            apiBase,
            model
          );
          Logger.info("utils", "First query keywords extracted for context", {
            firstQuery,
            firstQueryKeywords,
            userId: user.id,
          });
        } catch (error) {
          Logger.warn(
            "Failed to extract first query keywords, continuing without them",
            {
              firstQuery,
              error: error instanceof Error ? error.message : String(error),
              userId: user.id,
            }
          );
        }

        // Use last 3 turns for context
        const recentHistory = conversationHistory.slice(-3);
        const contextParts = recentHistory.map(
          (turn) => `Q: ${turn.question}\nA: ${turn.answer}`
        );

        // Include first query context to maintain topic focus
        contextualQuery = `IMPORTANT: The conversation started with this question: "${firstQuery}"
Keep this original topic in mind when extracting keywords.

Recent conversation:
${contextParts.join("\n\n")}

Current question: ${query}`;
      }

      // Extract individual keywords from the contextual query
      const searchKeywordsArray = await extractKeywords(
        contextualQuery,
        apiKey,
        apiBase,
        model
      );

      // Merge first query keywords with current keywords
      // This ensures we don't lose the original topic focus
      if (firstQueryKeywords.length > 0) {
        // Add first query keywords that aren't already in the current search
        const uniqueFirstKeywords = firstQueryKeywords.filter(
          (kw) => !searchKeywordsArray.includes(kw)
        );
        if (uniqueFirstKeywords.length > 0) {
          // Prepend first query keywords to prioritize original topic
          searchKeywordsArray.unshift(...uniqueFirstKeywords);
          Logger.info(
            "utils",
            "Merged first query keywords to maintain topic focus",
            {
              firstQueryKeywords,
              currentKeywords: searchKeywordsArray,
              addedKeywords: uniqueFirstKeywords,
              userId: user.id,
            }
          );
        }
      }

      // Detect when keyword extraction returns empty array (should not happen due to fallback)
      if (searchKeywordsArray.length === 0) {
        Logger.warn(
          "Keyword extraction returned empty array, using original query as fallback",
          {
            originalQuery: query,
            contextualQuery,
            userId: user.id,
            teamId: user.teamId,
          }
        );
        // Fallback to using original query as single keyword
        searchKeywordsArray.push(query);
      }

      // Log keyword extraction results
      Logger.info("utils", "AI Ask keywords extracted", {
        originalQuery: query,
        contextualQuery: conversationHistory?.length
          ? "with conversation context"
          : "no context",
        extractedKeywords: searchKeywordsArray,
        keywordCount: searchKeywordsArray.length,
        usedFallback:
          searchKeywordsArray.length === 1 && searchKeywordsArray[0] === query,
        userId: user.id,
        teamId: user.teamId,
      });

      // Emit search_strategy SSE event with extracted keywords
      ctx.res.write(
        `data: ${JSON.stringify({
          type: "search_strategy",
          keywords: searchKeywordsArray,
          usedFallback:
            searchKeywordsArray.length === 1 &&
            searchKeywordsArray[0] === query,
        })}\n\n`
      );

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
        collectionId: collectionId || undefined,
        dateFilter: (dateFilter as DateFilter) || undefined,
        statusFilter: (statusFilter as StatusFilter[]) || undefined,
        maxDocuments: maxDocuments,
        collaboratorIds: userId ? [userId] : undefined,
        documentIds,
      };

      Logger.info("utils", "AI Ask search options", {
        originalQuery: query,
        extractedKeywords: searchKeywordsArray,
        hasConversationHistory: !!conversationHistory?.length,
        historyLength: conversationHistory?.length || 0,
        searchOptions,
        userId: user.id,
        teamId: user.teamId,
      });

      // PERMISSION CHECK: SearchHelper.searchForUser automatically filters by user permissions
      // It uses Document.withMembershipScope which includes:
      // 1. Collection membership filtering
      // 2. Document membership filtering
      // 3. Group membership filtering
      Logger.info(
        "utils",
        "AI Ask initiating parallel multi-keyword search with permission filtering",
        {
          userId: user.id,
          teamId: user.teamId,
          keywords: searchKeywordsArray,
          keywordCount: searchKeywordsArray.length,
          filters: searchOptions,
        }
      );

      // Track permission filtering per keyword (Task 9.3)
      const keywordPermissionStats = new Map<
        string,
        { requested: number; authorized: number }
      >();

      // Execute parallel multi-keyword search with progress callback
      const mergedResults = await searchWithMultipleKeywords(
        searchKeywordsArray,
        user as never,
        searchOptions,
        (keyword: string, resultCount: number) => {
          // Track authorized document count per keyword (Task 9.3)
          keywordPermissionStats.set(keyword, {
            requested: resultCount,
            authorized: resultCount, // SearchHelper.searchForUser already applies permission filtering
          });

          // Emit search_progress event for each keyword search completion
          ctx.res.write(
            `data: ${JSON.stringify({
              type: "search_progress",
              keyword,
              resultCount,
              status: "complete",
            })}\n\n`
          );

          Logger.info("utils", "AI Ask search progress event emitted", {
            keyword,
            resultCount,
            userId: user.id,
          });
        }
      );

      // Log requested vs authorized document counts per keyword (Task 9.3)
      Logger.info(
        "utils",
        "AI Ask parallel search complete - permission filtered",
        {
          mergedResultCount: mergedResults.length,
          userId: user.id,
          teamId: user.teamId,
          permissionCheck:
            "SearchHelper.searchForUser applied user permission filtering to each keyword search",
          keywordPermissionStats: Array.from(
            keywordPermissionStats.entries()
          ).map(([keyword, stats]) => ({
            keyword,
            requestedCount: stats.requested,
            authorizedCount: stats.authorized,
          })),
        }
      );

      // Emit search_complete event with result counts
      ctx.res.write(
        `data: ${JSON.stringify({
          type: "search_complete",
          totalDocuments: mergedResults.length,
          uniqueDocuments: mergedResults.length,
        })}\n\n`
      );

      Logger.info("utils", "AI Ask search complete event emitted", {
        totalDocuments: mergedResults.length,
        uniqueDocuments: mergedResults.length,
        userId: user.id,
      });

      // Check if we need to warn about partial failures
      // Count failed searches from searchWithMultipleKeywords
      const totalKeywords = searchKeywordsArray.length;
      const successfulKeywords =
        mergedResults.length > 0
          ? new Set(mergedResults.flatMap((r) => r.matchedKeywords)).size
          : 0;
      const failedKeywords = totalKeywords - successfulKeywords;

      // Warn if more than 50% of searches failed but we still have some results
      if (failedKeywords > totalKeywords / 2 && mergedResults.length > 0) {
        Logger.warn("AI Ask partial search failure detected", {
          totalKeywords,
          successfulKeywords,
          failedKeywords,
          failureRate: `${((failedKeywords / totalKeywords) * 100).toFixed(1)}%`,
          userId: user.id,
        });

        // Emit warning event to frontend
        ctx.res.write(
          `data: ${JSON.stringify({
            type: "warning",
            code: "partial_search_failure",
            message:
              "Some search terms didn't return results, but we found documents for others.",
          })}\n\n`
        );
      }

      if (!mergedResults.length) {
        Logger.warn("AI Ask all searches returned zero results", {
          query,
          keywords: searchKeywordsArray,
          keywordCount: searchKeywordsArray.length,
          userId: user.id,
          teamId: user.teamId,
          searchOptions,
          reason: "No documents found for any search terms",
        });

        // Emit error event with helpful suggestions
        ctx.res.write(
          `data: ${JSON.stringify({
            type: "error",
            code: "no_results",
            error: "No documents found for any search terms",
            suggestions: [
              "Try using different or broader keywords",
              "Check if you have access to the relevant documents",
              "Verify that documents exist for this topic",
            ],
          })}\n\n`
        );

        // Generate a helpful response even when no documents are found
        // Let LLM respond in user's language
        const noResultsPrompt = `You are a helpful assistant. The user asked: "${query}"

Unfortunately, we couldn't find any relevant documents in the knowledge base for this question.

Please provide a friendly response that:
1. MUST be in the same language as the user's question
2. Acknowledges that no relevant information was found
3. Suggests trying different keywords or checking document access
4. Keep it concise (under 100 words)`;

        try {
          const trimmedBase = apiBase.replace(/\/$/, "");
          const endpoint = /\/chat\/completions$/i.test(trimmedBase)
            ? trimmedBase
            : `${trimmedBase}/chat/completions`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: noResultsPrompt,
                },
              ],
              stream: true,
            }),
          });

          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              if (done) {break;}

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");

              for (const line of lines) {
                if (!line.trim() || !line.startsWith("data: ")) {continue;}
                if (line.includes("[DONE]")) {continue;}

                try {
                  const data = JSON.parse(line.slice(6)) as {
                    choices?: ChatCompletionChoice[];
                  };
                  const content = parseAiResponse(data.choices?.[0] || {});

                  if (content) {
                    ctx.res.write(
                      `data: ${JSON.stringify({
                        type: "content",
                        content,
                      })}\n\n`
                    );
                  }
                } catch (_e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          Logger.error(
            "Failed to generate no-results response",
            error instanceof Error ? error : new Error(String(error)),
            { query, userId: user.id }
          );
        }

        ctx.res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        ctx.res.end();
        return;
      }

      // PERMISSION CHECK: Fetch full document content with permission filtering
      // Using Document.withMembershipScope ensures only authorized documents are included
      // Extract document IDs from merged results
      const resultDocumentIds = mergedResults.map(
        (r) => (r.document as { id: string }).id
      );

      // Log permission check attempt
      Logger.info("utils", "AI Ask fetching documents with permission check", {
        requestedDocumentIds: resultDocumentIds,
        requestedCount: resultDocumentIds.length,
        userId: user.id,
        teamId: user.teamId,
        permissionScope: "Document.withMembershipScope",
        scopeIncludes: [
          "collection membership filtering",
          "document membership filtering",
          "group membership filtering",
        ],
      });

      // Maintain existing Document.withMembershipScope permission filtering
      const documents = await Document.withMembershipScope(user.id, {
        includeDrafts: true,
      }).findAll({
        where: {
          id: resultDocumentIds,
          teamId: user.teamId,
        },
      });

      // Log permission filtering results (Task 9.3)
      const authorizedDocumentIds = documents.map((doc) => doc.id);
      const unauthorizedDocumentIds = resultDocumentIds.filter(
        (id) => !authorizedDocumentIds.includes(id)
      );

      // Calculate permission filtering per keyword
      const keywordFilteringDetails = searchKeywordsArray.map((keyword) => {
        const keywordDocs = mergedResults.filter((r) =>
          r.matchedKeywords.includes(keyword)
        );
        const keywordAuthorizedDocs = keywordDocs.filter((r) =>
          authorizedDocumentIds.includes((r.document as { id: string }).id)
        );
        return {
          keyword,
          totalMatches: keywordDocs.length,
          authorizedMatches: keywordAuthorizedDocs.length,
          filteredMatches: keywordDocs.length - keywordAuthorizedDocs.length,
        };
      });

      if (unauthorizedDocumentIds.length > 0) {
        // Log any permission filtering that occurs (Task 9.3)
        Logger.warn(
          "AI Ask permission filtering removed unauthorized documents",
          {
            userId: user.id,
            teamId: user.teamId,
            requestedCount: resultDocumentIds.length,
            authorizedCount: authorizedDocumentIds.length,
            filteredCount: unauthorizedDocumentIds.length,
            unauthorizedDocumentIds,
            keywordFilteringDetails,
            securityNote:
              "User attempted to access documents without proper permissions",
            auditTrail:
              "Permission filtering applied via Document.withMembershipScope",
          }
        );
      } else {
        Logger.info("utils", "AI Ask all requested documents authorized", {
          userId: user.id,
          teamId: user.teamId,
          documentCount: authorizedDocumentIds.length,
          permissionCheckPassed: true,
          keywordFilteringDetails,
          auditTrail:
            "All documents passed permission check via Document.withMembershipScope",
        });
      }

      // Build context from search results
      // Map merged results to documents preserving relevance scores
      const contextParts = documents.map((doc, index) => {
        const markdown = DocumentHelper.toMarkdown(doc);
        const strippedMarkdown = stripTranscriptCodeBlocks(markdown);

        // Find the corresponding merged result to get context and relevance info
        const mergedResult = mergedResults.find(
          (r) => (r.document as { id: string }).id === doc.id
        );

        const charsReduced = markdown.length - strippedMarkdown.length;
        if (charsReduced > 0) {
          Logger.info("utils", "Stripped transcript from document for AI Ask", {
            documentId: doc.id,
            documentTitle: doc.title,
            charsReduced,
            userId: user.id,
          });
        }

        return `## Document ${index + 1}: ${doc.title}
Document ID: ${doc.id}
Collection: ${doc.collection?.name || "N/A"}
URL: ${doc.url}
Relevance Score: ${mergedResult?.relevanceScore.toFixed(2) || "N/A"}
Matched Keywords: ${mergedResult?.matchedKeywords.join(", ") || "N/A"}
${mergedResult?.context ? `\nRelevant excerpt:\n${mergedResult.context}\n` : ""}
Full content:
${strippedMarkdown}`;
      });

      const context = contextParts.join("\n\n---\n\n");

      // PERMISSION CHECK: Verify we have authorized documents before proceeding
      if (documents.length === 0) {
        Logger.warn(
          "AI Ask no authorized documents after permission filtering",
          {
            userId: user.id,
            teamId: user.teamId,
            query,
            keywords: searchKeywordsArray,
            requestedDocumentCount: resultDocumentIds.length,
          }
        );

        ctx.body = {
          data: {
            answer:
              "I found some documents related to your question, but you don't have permission to access them. Please contact your administrator if you believe you should have access.",
            sources: [],
            followups: [],
          },
        };
        return;
      }

      // Build sources list - only includes authorized documents
      // Ensure URL is properly generated with title slug
      const sources = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        url: Document.getPath({
          title: doc.title,
          urlId: doc.urlId,
        }),
        collectionId: doc.collectionId,
      }));

      Logger.info(
        "utils",
        "AI Ask building context from authorized documents",
        {
          userId: user.id,
          teamId: user.teamId,
          documentCount: documents.length,
          sourceIds: sources.map((s) => s.id),
        }
      );

      // Generate AI answer with conversation context
      const trimmedBase = apiBase.replace(/\/$/, "");
      const endpoint = /\/chat\/completions$/i.test(trimmedBase)
        ? trimmedBase
        : `${trimmedBase}/chat/completions`;

      const languageInstruction = language
        ? `IMPORTANT: Answer in ${language === "zh_CN" || language === "zh-CN" ? "Chinese (Simplified)" : language === "zh_TW" || language === "zh-TW" ? "Chinese (Traditional)" : language.replace("_", "-")}. `
        : "CRITICAL: Detect the language of the user's question and answer in THE EXACT SAME LANGUAGE. If the user asks in Chinese, answer in Chinese. If in English, answer in English. If in Japanese, answer in Japanese. Match the user's language perfectly. ";

      let systemPrompt = `You are a conversational knowledge base assistant. Answer questions based on the provided documents.

CRITICAL RULES:
1. ${languageInstruction}Provide detailed, comprehensive answers (300-500 words recommended)
2. ONLY use information from the provided documents
3. If the documents don't contain the answer, clearly state "The provided documents don't contain information about this" (in the user's language)
4. Explain thoroughly with:
   - Key concepts and definitions
   - Step-by-step explanations when applicable
   - Specific examples and details from the documents
   - Context and background information
5. Reference documents using: [Document Title](doc-id)
6. Use bullet points, numbered lists, and clear paragraph structure for readability
7. Include relevant details, technical specifics, and concrete examples rather than high-level summaries`;

      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-3);
        const historyText = recentHistory
          .map((turn) => `User: ${turn.question}\nAssistant: ${turn.answer}`)
          .join("\n\n");
        systemPrompt += `\n\nPrevious conversation:\n${historyText}\n\nUse this context to provide a more relevant answer to the current question.`;
      }

      systemPrompt += `\n\nHere are the relevant documents:\n\n${context}`;

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

      // Check if we need to use fallback model based on context length
      // Some models like qwen3-30b-a3b-instruct can only handle ~15000 characters
      // Use fallback model for contexts that exceed the primary model's capacity
      const MAX_CONTEXT_LENGTH = parseInt(
        process.env.LLM_MAX_CONTEXT_LENGTH || "15000",
        10
      );
      let currentModel = model;

      if (context.length > MAX_CONTEXT_LENGTH && fallbackModel) {
        Logger.info(
          "utils",
          "Context too large for primary model, using fallback",
          {
            primaryModel: model,
            fallbackModel,
            contextLength: context.length,
            maxContextLength: MAX_CONTEXT_LENGTH,
            userId: user.id,
          }
        );
        currentModel = fallbackModel;
        // Swap so we don't retry with the model that can't handle large contexts
        fallbackModel = undefined;
      }

      const makeRequest = async (modelToUse: string) => {
        const requestBody = JSON.stringify({
          model: modelToUse,
          messages,
          stream: true,
        });

        Logger.info("utils", "AI Ask LLM request", {
          model: modelToUse,
          endpoint,
          requestLength: requestBody.length,
          messageCount: messages.length,
          contextLength: context.length,
          hasConversationHistory: !!conversationHistory?.length,
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

          Logger.error("AI Ask request failed", new Error(message), {
            endpoint,
            status: response.status,
            payload,
            model: modelToUse,
            userId: user.id,
          });

          return { shouldRetry: false, error: message };
        }

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

      // PERMISSION CHECK: Send only authorized sources to client
      // At this point, sources array only contains documents the user has permission to access
      Logger.info("utils", "AI Ask sending authorized sources to client", {
        userId: user.id,
        teamId: user.teamId,
        sourceCount: sources.length,
        sourceIds: sources.map((s) => s.id),
        permissionVerification:
          "All sources verified through Document.withMembershipScope",
        securityCompliance: "Only authorized documents included in response",
      });

      ctx.res.write(
        `data: ${JSON.stringify({ type: "sources", sources })}\n\n`
      );

      // Stream the answer and collect it for follow-up generation
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let chunkCount = 0;

      Logger.info("utils", "AI Ask starting LLM response stream", {
        model: currentModel,
        userId: user.id,
        teamId: user.teamId,
      });

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            Logger.info("utils", "AI Ask LLM stream completed", {
              model: currentModel,
              totalChunks: chunkCount,
              fullAnswerLength: fullAnswer.length,
              userId: user.id,
            });
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
                  chunkCount++;
                  fullAnswer += delta;

                  // Log first few chunks and periodic updates
                  if (chunkCount <= 3 || chunkCount % 10 === 0) {
                    Logger.info("utils", "AI Ask LLM response chunk received", {
                      chunkNumber: chunkCount,
                      deltaLength: delta.length,
                      totalLength: fullAnswer.length,
                      deltaPreview: delta.substring(0, 50),
                      userId: user.id,
                    });
                  }

                  ctx.res.write(
                    `data: ${JSON.stringify({ type: "content", content: delta })}\n\n`
                  );
                }
              } catch (parseError) {
                Logger.warn("Failed to parse LLM stream chunk", {
                  jsonStr: jsonStr.substring(0, 100),
                  error:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                  userId: user.id,
                });
                // Skip invalid JSON
              }
            }
          }
        }

        // Log final answer before generating follow-ups
        Logger.info("utils", "AI Ask LLM response complete", {
          model: currentModel,
          fullAnswerLength: fullAnswer.length,
          answerPreview: fullAnswer.substring(0, 200),
          totalChunks: chunkCount,
          userId: user.id,
          teamId: user.teamId,
        });

        // Generate follow-up questions
        const followups = await generateFollowups(
          query,
          fullAnswer,
          sources,
          apiKey,
          apiBase,
          model
        );

        // Send follow-ups
        if (followups.length > 0) {
          Logger.info("utils", "AI Ask sending follow-ups to client", {
            followupCount: followups.length,
            followups,
            userId: user.id,
          });
          ctx.res.write(
            `data: ${JSON.stringify({ type: "followups", followups })}\n\n`
          );
        }

        // Send completion event
        Logger.info("utils", "AI Ask sending done event to client", {
          userId: user.id,
        });
        ctx.res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        ctx.res.end();

        Logger.info(
          "utils",
          "AI Ask streaming completed with permission checks",
          {
            model: currentModel,
            sourceCount: sources.length,
            followupCount: followups.length,
            answerLength: fullAnswer.length,
            userId: user.id,
            teamId: user.teamId,
            permissionSummary: {
              requestedDocuments: resultDocumentIds.length,
              authorizedDocuments: authorizedDocumentIds.length,
              filteredDocuments: unauthorizedDocumentIds.length,
              allAuthorized: unauthorizedDocumentIds.length === 0,
            },
          }
        );
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
      Logger.error("AI Ask failed", wrappedError);
      ctx.throw(
        InvalidRequestError("Sorry, something went wrong during AI Ask")
      );
    }
  }
);

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

    // Set up SSE response headers early, before any writes
    ctx.respond = false;
    ctx.res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    Logger.info("utils", "AI Search SSE headers sent", {
      userId: user.id,
      statusCode: ctx.res.statusCode,
    });

    try {
      // Import models dynamically
      const { Document } = await import("@server/models");
      const { DocumentHelper } = await import(
        "@server/models/helpers/DocumentHelper"
      );
      const SearchHelper = (await import("@server/models/helpers/SearchHelper"))
        .default;

      // Extract individual keywords from the natural language query
      const searchKeywordsArray = await extractKeywords(
        query,
        apiKey,
        apiBase,
        model
      );

      // Join keywords into a single search query string for now
      // TODO: In future tasks, this will be used for parallel multi-keyword search
      const searchKeywords = searchKeywordsArray.join(" ");

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
        dateFilter: (dateFilter as DateFilter) || undefined,
        statusFilter: (statusFilter as StatusFilter[]) || undefined,
        limit: maxDocuments,
        collaboratorIds: userId ? [userId] : undefined,
        documentIds,
      };

      Logger.info("utils", "AI search options", {
        originalQuery: query,
        extractedKeywords: searchKeywordsArray,
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
      // Ensure URL is properly generated with title slug
      const sources = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        url: Document.getPath({
          title: doc.title,
          urlId: doc.urlId,
        }),
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

      // Check if we need to use fallback model based on context length
      // Some models like qwen3-30b-a3b-instruct can only handle ~15000 characters
      // Use fallback model for contexts that exceed the primary model's capacity
      const MAX_CONTEXT_LENGTH = parseInt(
        process.env.LLM_MAX_CONTEXT_LENGTH || "15000",
        10
      );
      let currentModel = model;

      if (context.length > MAX_CONTEXT_LENGTH && fallbackModel) {
        Logger.info(
          "utils",
          "Context too large for primary model, using fallback",
          {
            primaryModel: model,
            fallbackModel,
            contextLength: context.length,
            maxContextLength: MAX_CONTEXT_LENGTH,
            userId: user.id,
          }
        );
        currentModel = fallbackModel;
        // Swap so we don't retry with the model that can't handle large contexts
        fallbackModel = undefined;
      }

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
  async (ctx: APIContext, next) => {
    Logger.info("utils", "ai.generate request received", {
      body: ctx.request.body,
      hasBody: !!ctx.request.body,
      bodyKeys: ctx.request.body ? Object.keys(ctx.request.body) : [],
    });
    await next();
  },
  validate(T.AiGenerateSchema),
  async (ctx: APIContext<T.AiGenerateReq>) => {
    const { user } = ctx.state.auth;
    const prompt = trim(ctx.input.body.prompt ?? "");
    const context = trim(ctx.input.body.context ?? "");
    const mentionedDocumentIds = ctx.input.body.mentionedDocumentIds ?? [];
    const mode = (ctx.input.body.mode ?? "fast") as AiPromptMode;

    Logger.info("utils", "ai.generate validation passed", {
      promptLength: prompt.length,
      contextLength: context.length,
      mode,
      userId: user.id,
    });

    if (!prompt) {
      ctx.throw(InvalidRequestError("Prompt is required"));
    }

    // Calculate context length for model selection
    const totalContextLength = prompt.length + context.length;

    Logger.info("utils", "AI Generate request", {
      promptLength: prompt.length,
      contextLength: context.length,
      totalContextLength,
      mode,
      mentionedDocumentCount: mentionedDocumentIds.length,
      userId: user.id,
      teamId: user.teamId,
    });

    const { apiKey, apiBase, model, fallbackModel } = await getModelConfig(
      false,
      user.teamId,
      totalContextLength
    );

    Logger.info("utils", "AI Generate model config", {
      hasApiKey: !!apiKey,
      hasApiBase: !!apiBase,
      model,
      fallbackModel,
      userId: user.id,
    });

    if (!apiKey || !apiBase || !model) {
      Logger.error(
        "AI configuration incomplete",
        new Error("Missing required configuration"),
        {
          hasApiKey: !!apiKey,
          hasApiBase: !!apiBase,
          hasModel: !!model,
          userId: user.id,
        }
      );
      ctx.throw(InvalidRequestError("AI configuration is incomplete"));
    }

    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    try {
      let instructions =
        "You write Markdown Text upon user's request. " +
        "Always emit valid Markdown that renders correctly. " +
        "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
        "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text. " +
        "If writing a meeting minutes or summary, be professional thinking the sections and the format. " +
        "CRITICAL: When summarizing or processing provided context, ONLY use information from that context - DO NOT add external information or make up content. " +
        "If the provided context is insufficient or unclear, state that clearly instead of fabricating information.";

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
                    error
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
