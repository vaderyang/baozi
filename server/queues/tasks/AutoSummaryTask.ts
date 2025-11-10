import env from "@server/env";
import Logger from "@server/logging/Logger";
import { Team, TranscriptionJob } from "@server/models";
import { TeamPreference } from "@shared/types";
import fetch, { llmUserAgent } from "@server/utils/fetch";
import parseAiResponse from "@server/utils/parseAiResponse";
import BaseTask, { TaskPriority } from "./BaseTask";

type Props = {
  /** The ID of the transcription job */
  jobId: string;
};

/**
 * A task that processes auto-summary generation for completed transcription jobs.
 * Generates timeline summaries and prepares the complete content for insertion.
 */
export default class AutoSummaryTask extends BaseTask<Props> {
  public async perform(props: Props): Promise<void> {
    const { jobId } = props;

    Logger.info("task", "Starting auto summary task", {
      jobId,
    });

    try {
      // Fetch the transcription job
      const job = await TranscriptionJob.findByPk(jobId, {
        rejectOnEmpty: true,
      });

      // Verify job has transcription result
      if (!job.result) {
        Logger.warn(
          "task",
          "Job has no transcription result, skipping auto summary",
          {
            jobId,
          }
        );
        return;
      }

      // Verify job has autoSummary flag
      if (!job.metadata?.autoSummary) {
        Logger.debug("task", "Job does not have autoSummary flag, skipping", {
          jobId,
        });
        return;
      }

      Logger.info(
        "task",
        "Processing auto summary for completed transcription",
        {
          jobId,
          textLength: job.result.text.length,
          speakerSegmentCount: job.result.speakerSegments?.length || 0,
        }
      );

      // Generate timeline summaries using the AI service
      // This will use the same logic as in the frontend TranscriptionStatusManager
      const timelineEntries = await this.generateTimelineSummaries(
        job.result,
        job.teamId,
        jobId
      );

      // Update job with timeline summaries
      const updatedResult = {
        ...job.result,
        timelineEntries,
        summaryGenerated: true,
        summaryGeneratedAt: new Date().toISOString(),
      };

      // Update job with enhanced result
      job.result = updatedResult;
      await job.save();

      // Emit websocket event to notify frontend
      await job.emitWebsocketEvent();

      Logger.info("task", "Auto summary completed successfully", {
        jobId,
        timelineEntryCount: timelineEntries?.length || 0,
      });
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));

      Logger.error("Auto summary task failed", wrappedError, {
        jobId,
      });

      // Don't fail the job, just log the error
      // The transcription is still complete, just without auto summary
      try {
        const job = await TranscriptionJob.findByPk(jobId);
        if (job) {
          job.result = {
            ...job.result,
            summaryGenerated: false,
            summaryError: wrappedError.message,
            summaryErrorAt: new Date().toISOString(),
          };
          await job.save();
          await job.emitWebsocketEvent();
        }
      } catch (updateError) {
        Logger.error(
          "Failed to update job with summary error",
          updateError as Error,
          { jobId }
        );
      }

      // Don't re-throw auto summary errors
    }
  }

  /**
   * Generate timeline summaries using the AI service.
   */
  private async generateTimelineSummaries(
    result: any,
    teamId: string,
    jobId: string
  ): Promise<any[]> {
    try {
      // Import AI client dynamically to avoid circular dependencies
      // const { client } = await import("~/utils/ApiClient");

      // Build timeline chunks similar to frontend logic
      const segments = result.speakerSegments || [];
      const transcript = result.text || "";

      // Create full transcript with timestamps
      const fullText =
        segments.length > 0
          ? segments
              .map((segment: any, index: number) => {
                const timestamp =
                  typeof segment.start === "number"
                    ? `[${Math.floor(segment.start / 60)}:${(segment.start % 60).toString().padStart(2, "0")}] `
                    : `[Segment ${index + 1}] `;
                return `${timestamp}Speaker ${segment.spk}: ${segment.text}`;
              })
              .join("\n\n")
          : transcript;

      if (!fullText.trim()) {
        Logger.warn(
          "task",
          "No transcript text available for timeline summarization"
        );
        return [];
      }

      const TIMELINE_PROMPT =
        "You are analyzing a complete audio transcript to create an intelligent timeline with title-like summaries.\n" +
        "Your task:\n" +
        "1. Read the entire transcript carefully to understand the conversation flow\n" +
        "2. Identify 3-8 distinct topics or phases in the conversation\n" +
        "3. For each topic, determine the appropriate start and end time\n" +
        "4. Generate a concise title-like summary (max 30 words) for each topic\n\n" +
        "!!! CRITICAL: YOU MUST GENERATE MULTIPLE ENTRIES !!!\n" +
        "- Minimum 3 timeline entries, maximum 8 entries\n" +
        "- Each entry MUST represent a different topic/conversation phase\n" +
        '- DO NOT create a single entry called "完整录音内容" or similar\n' +
        "- Break the conversation into natural topic segments\n\n" +
        "Segmentation guidelines:\n" +
        "- Look for topic changes, speaker transitions, discussion shifts\n" +
        "- Group related discussion points together\n" +
        "- Each segment should be 2-10 minutes of conversation\n" +
        "- Create boundaries at natural conversation pauses\n\n" +
        "Summary requirements:\n" +
        "- Use the same language as the transcript\n" +
        "- Each summary must be a title-like phrase, NOT a description\n" +
        "- Focus on the main topic/theme, not conversation details\n" +
        "- Maximum 30 words per summary\n\n" +
        "Good examples:\n" +
        '- "讨论产品新功能的设计方案"\n' +
        '- "分析市场数据并制定策略"\n' +
        '- "解决技术实现中的关键问题"\n' +
        '- "确定项目时间和资源分配"\n\n' +
        "Bad examples (STRICTLY AVOID):\n" +
        '- "Speaker A says..., then Speaker B responds..."\n' +
        '- "这段对话包含了关于..."\n' +
        '- "完整录音内容"\n' +
        '- "Full Transcript — Complete audio recording content"\n' +
        "- Copy-pasting actual transcript text\n\n" +
        "Output format: JSON array with timeline entries\n" +
        "Each entry must have: id (format: timeline-N), summary, startTime (seconds), endTime (seconds)\n" +
        'Example: [{"id": "timeline-0", "summary": "讨论项目进展和下一步计划", "startTime": 0, "endTime": 180}, {"id": "timeline-1", "summary": "分析技术方案和可行性", "startTime": 180, "endTime": 360}]\n\n' +
        "Complete transcript:\n";

      const { apiKey, apiBase, model } = await this.getModelConfig(
        teamId,
        TIMELINE_PROMPT.length + fullText.length
      );

      const trimmedBase = apiBase.replace(/\/$/, "");
      const endpoint = /\/chat\/completions$/i.test(trimmedBase)
        ? trimmedBase
        : `${trimmedBase}/chat/completions`;

      const messages = [
        {
          role: "system",
          content:
            "You are an expert meeting assistant that produces structured JSON summaries from transcripts. " +
            "Only use information provided in the transcript.",
        },
        {
          role: "user",
          content: `${TIMELINE_PROMPT}${fullText}\n\nGenerate timeline summary as a JSON array.`,
        },
      ];

      const aiResponse = await this.callLLM(endpoint, apiKey, model, messages);
      let aiResults: Array<{
        id: string;
        summary: string;
        startTime: number;
        endTime?: number;
      }> = [];

      if (aiResponse) {
        try {
          const parsed = JSON.parse(aiResponse);
          if (Array.isArray(parsed)) {
            aiResults = parsed.filter(
              (item) =>
                item.id && item.summary && typeof item.startTime === "number"
            );
          }
        } catch (parseError) {
          Logger.warn("Failed to parse AI timeline response", {
            jobId,
            response: aiResponse.slice(0, 300),
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });

          // Fallback: create simple timeline based on content
          aiResults = this.createFallbackTimeline(result);
        }
      }

      Logger.info("task", "Generated AI timeline summaries", {
        jobId,
        entriesGenerated: aiResults.length,
      });

      return aiResults;
    } catch (error) {
      Logger.error("Failed to generate AI timeline summaries", error as Error, {
        jobId,
      });

      // Fallback timeline
      return this.createFallbackTimeline(result);
    }
  }

  /**
   * Create a fallback timeline when AI generation fails.
   */
  private createFallbackTimeline(result: any): any[] {
    const segments = result.speakerSegments || [];
    const entries: any[] = [];

    if (segments.length > 0) {
      const segmentGroups = Math.max(Math.ceil(segments.length / 3), 4);
      const groupSize = Math.ceil(segments.length / segmentGroups);

      for (let i = 0; i < segmentGroups; i++) {
        const startIdx = i * groupSize;
        const endIdx = Math.min(startIdx + groupSize, segments.length);
        const groupSegments = segments.slice(startIdx, endIdx);

        const startTime =
          typeof groupSegments[0]?.start === "number"
            ? groupSegments[0].start
            : i * 120;
        const endTime =
          typeof groupSegments[groupSegments.length - 1]?.end === "number"
            ? groupSegments[groupSegments.length - 1].end
            : startTime + 120;

        const topic =
          groupSegments[0]?.text.split(" ").slice(0, 8).join(" ") ||
          `讨论主题${i + 1}`;

        entries.push({
          id: `timeline-${i}`,
          summary: topic,
          startTime,
          endTime,
        });
      }
    } else {
      // Single fallback entry
      entries.push({
        id: "timeline-0",
        summary: "录音内容概要",
        startTime: 0,
        endTime: undefined,
      });
    }

    return entries;
  }

  /**
   * Resolve AI model configuration for timeline generation.
   */
  private async getModelConfig(teamId: string, contextLength: number) {
    let apiKey = this.envValue(
      "LLM_API_KEY",
      "AI_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_KEY"
    );
    let apiBase = this.envValue(
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

    const team = await Team.findByPk(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Check team preferences for API key
    const teamApiKey = team.getPreference(TeamPreference.LLM_API_KEY);
    if (typeof teamApiKey === "string" && teamApiKey.trim()) {
      apiKey = teamApiKey.trim();
      Logger.info("task", "Using team-specific LLM API key", {
        teamId,
      });
    }

    // Check team preferences for API base URL
    const teamApiBase = team.getPreference(TeamPreference.LLM_API_BASE_URL);
    if (typeof teamApiBase === "string" && teamApiBase.trim()) {
      apiBase = teamApiBase.trim();
      Logger.info("task", "Using team-specific LLM API base URL", {
        teamId,
        apiBase: apiBase.substring(0, 30) + "...",
      });
    }

    // Timeline summaries can be large, prefer primary model
    const primaryModelPref = team.getPreference(
      TeamPreference.AiGenerateTextModel
    );
    const model =
      (typeof primaryModelPref === "string" && primaryModelPref.trim()) ||
      env.LLM_PRIMARY_MODEL_NAME ||
      env.LLM_MODEL_NAME ||
      "zai-glm-4.6";

    Logger.info("task", "Auto summary model config resolved", {
      teamId,
      model,
      contextLength,
    });

    return { apiKey, apiBase, model };
  }

  /**
   * Call the configured LLM endpoint and return the response text.
   */
  private async callLLM(
    endpoint: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": llmUserAgent,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(
        "Auto summary LLM call failed",
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
    const choice = result.choices?.[0];
    const text = parseAiResponse(choice);

    if (!text) {
      throw new Error("No text in LLM response");
    }

    return text.trim();
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
      "Auto summary task failed after all retry attempts",
      new Error("Max retries exhausted"),
      { jobId }
    );
  }

  /**
   * Job options with exponential backoff retry logic.
   */
  public get options() {
    return {
      priority: TaskPriority.Low, // Lower priority than transcription
      attempts: 2, // Fewer retries for auto summary
      backoff: {
        type: "exponential" as const,
        delay: 30000, // 30 seconds
      },
    };
  }
}
