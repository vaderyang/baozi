import Logger from "@server/logging/Logger";
import { Document, Collection, User } from "@server/models";
import env from "@server/env";

interface AIArchiveSuggestion {
  suggestions: Array<{
    targetId: string;
    targetType: "collection" | "document";
    targetName: string;
    reason: string;
    confidence: number;
  }>;
  suggestedTitle?: string;
  topics: string[];
  documentType: "meeting" | "interview" | "note" | "lecture" | "other";
}

interface AnalyzeTranscriptParams {
  documentId: string;
  transcript: string;
  userId: string;
}

/**
 * AI Archive Suggestion Service
 * Analyzes transcripts and suggests optimal organization locations
 */
class AIArchiveSuggestionService {
  /**
   * Get AI API configuration from environment
   * Uses Task model for lightweight operations (title generation, topic extraction, etc.)
   */
  private static getAIConfig() {
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
    // Use Task model for lightweight, frequent operations
    const model =
      this.envValue(
        "LLM_TASK_MODEL_NAME",
        "LLM_TASK_MODEL",
        "AI_TASK_MODEL",
        "TASK_MODEL"
      ) ||
      env.LLM_TASK_MODEL_NAME ||
      this.envValue(
        "LLM_MODEL_NAME",
        "LLM_MODEL",
        "AI_MODEL_NAME",
        "AI_MODEL",
        "OPENAI_MODEL_NAME",
        "OPENAI_MODEL",
        "MODEL"
      );

    return { apiKey, apiBase, model };
  }

  /**
   * Helper to get environment variable value
   */
  private static envValue(...keys: string[]): string | undefined {
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
   * Call AI API to analyze transcript
   */
  private static async callAI(
    prompt: string,
    apiKey: string,
    apiBase: string,
    model: string
  ): Promise<string> {
    const trimmedBase = apiBase.replace(/\/$/, "");
    const endpoint = /\/chat\/completions$/i.test(trimmedBase)
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;

    const requestBody = JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an intelligent document organization assistant. Analyze transcripts and suggest optimal locations for archiving.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    Logger.llmRequest("AIArchiveSuggestionService", "Archive suggestion LLM request", {
      model,
      endpoint,
      requestLength: requestBody.length,
      promptLength: prompt.length,
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
      const errorText = await response.text();
      throw new Error(`AI API request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    return data.choices?.[0]?.message?.content || "";
  }

  /**
   * Analyze transcript and generate archive suggestions
   */
  static async analyzeTranscript(
    params: AnalyzeTranscriptParams
  ): Promise<AIArchiveSuggestion> {
    const { documentId, transcript, userId } = params;

    Logger.info("AIArchiveSuggestionService", "Starting transcript analysis", {
      documentId,
      userId,
      transcriptLength: transcript.length,
    });

    try {
      // Get AI configuration
      const { apiKey, apiBase, model } = this.getAIConfig();

      if (!apiKey || !apiBase || !model) {
        throw new Error("AI configuration is incomplete");
      }

      // Get user and their collections
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Get user's collections
      const collections = await Collection.findAll({
        where: {
          teamId: user.teamId,
        },
        attributes: ["id", "name", "description"],
        limit: 50, // Limit to avoid token overflow
      });

      // Get recent documents for context
      const recentDocuments = await Document.findAll({
        where: {
          teamId: user.teamId,
          publishedAt: {
            [require("sequelize").Op.ne]: null,
          },
        },
        attributes: ["id", "title", "collectionId"],
        order: [["updatedAt", "DESC"]],
        limit: 20,
      });

      // Build prompt for AI
      const collectionsContext = collections
        .map(
          (c) =>
            `- ${c.name} (ID: ${c.id})${c.description ? `: ${c.description}` : ""}`
        )
        .join("\n");

      const recentDocsContext = recentDocuments
        .map((d) => `- ${d.title} (Collection: ${d.collectionId || "None"})`)
        .join("\n");

      const prompt = `Analyze this transcript and suggest where to archive it:

TRANSCRIPT:
${transcript.substring(0, 3000)}${transcript.length > 3000 ? "..." : ""}

USER'S COLLECTIONS:
${collectionsContext || "No collections yet"}

RECENT DOCUMENTS:
${recentDocsContext || "No recent documents"}

Provide your analysis in JSON format:
{
  "suggestedTitle": "A concise, descriptive title based on the content",
  "topics": ["topic1", "topic2", "topic3"],
  "documentType": "meeting|interview|note|lecture|other",
  "suggestions": [
    {
      "targetId": "collection-id or document-id",
      "targetType": "collection or document",
      "targetName": "Collection or Document name",
      "reason": "Why this location is suitable",
      "confidence": 0.0-1.0
    }
  ]
}

RULES:
1. Provide up to 3 suggestions, ordered by confidence
2. Confidence should be between 0 and 1
3. Reason should be specific and explain the match
4. If no good matches, return empty suggestions array
5. suggestedTitle should be concise (max 100 characters)
6. Return ONLY valid JSON, no additional text`;

      // Call AI API
      const aiResponse = await this.callAI(prompt, apiKey, apiBase, model);

      // Parse AI response
      let parsedResponse: AIArchiveSuggestion;
      try {
        // Extract JSON from response (in case AI adds extra text)
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in AI response");
        }
        parsedResponse = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        Logger.error(
          "Failed to parse AI response",
          parseError instanceof Error
            ? parseError
            : new Error(String(parseError)),
          {
            documentId,
            userId,
            aiResponse: aiResponse.substring(0, 500),
          }
        );
        // Return default response
        parsedResponse = {
          suggestions: [],
          topics: [],
          documentType: "other",
        };
      }

      // Validate and filter suggestions
      const validSuggestions = (parsedResponse.suggestions || [])
        .filter((s) => {
          // Verify target exists
          if (s.targetType === "collection") {
            return collections.some((c) => c.id === s.targetId);
          } else if (s.targetType === "document") {
            return recentDocuments.some((d) => d.id === s.targetId);
          }
          return false;
        })
        .slice(0, 3); // Limit to 3 suggestions

      const result: AIArchiveSuggestion = {
        suggestions: validSuggestions,
        suggestedTitle: parsedResponse.suggestedTitle,
        topics: (parsedResponse.topics || []).slice(0, 5),
        documentType: parsedResponse.documentType || "other",
      };

      Logger.info(
        "AIArchiveSuggestionService",
        "Transcript analysis complete",
        {
          documentId,
          userId,
          suggestionCount: result.suggestions.length,
          topics: result.topics,
          documentType: result.documentType,
        }
      );

      return result;
    } catch (error) {
      Logger.error(
        "AIArchiveSuggestionService analysis failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          documentId,
          userId,
        }
      );

      // Return empty suggestions on error
      return {
        suggestions: [],
        topics: [],
        documentType: "other",
      };
    }
  }
}

export default AIArchiveSuggestionService;
