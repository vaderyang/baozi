import FormData from "form-data";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { Attachment, Team, TranscriptionJob } from "@server/models";
import { TranscriptionJobStatus } from "@server/models/TranscriptionJob";
import fetch from "@server/utils/fetch";
import { TeamPreference } from "@shared/types";
import BaseTask, { TaskPriority } from "./BaseTask";
import AutoSummaryTask from "./AutoSummaryTask";

type Props = {
  /** The ID of the transcription job */
  jobId: string;
  /** The ID of the attachment */
  attachmentId: string;
  /** The ID of the user who initiated the transcription */
  userId: string;
  /** The ID of the document where the transcription will be inserted */
  documentId: string;
};

/**
 * A task that processes audio transcription jobs in the background.
 * Downloads the audio file, sends it to the transcription service,
 * and updates the job status with the result.
 */
export default class TranscriptionTask extends BaseTask<Props> {
  public async perform(props: Props): Promise<void> {
    const { jobId, attachmentId, userId, documentId } = props;

    Logger.info("task", "Starting transcription task", {
      jobId,
      attachmentId,
      userId,
      documentId,
    });

    // Fetch the transcription job
    const job = await TranscriptionJob.findByPk(jobId, {
      rejectOnEmpty: true,
    });

    // Fetch the attachment
    const attachment = await Attachment.findByPk(attachmentId);

    if (!attachment) {
      const error = "Attachment not found";
      Logger.error("Transcription task failed", new Error(error), {
        jobId,
        attachmentId,
      });
      await job.fail(error);
      throw new Error(error);
    }

    // Get transcription endpoint from team preferences or environment
    let transcriptionEndpoint = env.TRANSCRIPTION_ENDPOINT;

    try {
      const team = await Team.findByPk(job.teamId);
      if (team) {
        const teamEndpoint = team.getPreference(
          TeamPreference.TranscriptionEndpoint
        );
        if (typeof teamEndpoint === "string" && teamEndpoint.trim()) {
          transcriptionEndpoint = teamEndpoint.trim();
          Logger.info("task", "Using team-configured transcription endpoint", {
            jobId,
            teamId: job.teamId,
            endpoint: transcriptionEndpoint,
          });
        }
      }
    } catch (error) {
      Logger.warn(
        "Failed to load team transcription endpoint, using environment default",
        {
          jobId,
          teamId: job.teamId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }

    try {
      // Update job status to processing
      await job.updateStatus(TranscriptionJobStatus.Processing);

      Logger.info("task", "Downloading audio file", {
        jobId,
        attachmentId,
        fileName: attachment.name,
        contentType: attachment.contentType,
        fileSize: attachment.size,
      });

      // Get the file buffer
      let fileBuffer: Buffer;
      const downloadStartTime = Date.now();
      let downloadDuration: number;

      // For LocalStorage, read directly from disk to avoid localhost DNS issues
      if (env.FILE_STORAGE === "local" && attachment.key) {
        const fs = await import("fs/promises");
        const path = await import("path");
        const filePath = path.join(
          env.FILE_STORAGE_LOCAL_ROOT_DIR,
          attachment.key
        );
        fileBuffer = await fs.readFile(filePath);
        downloadDuration = Date.now() - downloadStartTime;
        Logger.info("task", "Read audio file from local storage", {
          jobId,
          filePath,
          fileSizeBytes: fileBuffer.length,
          downloadDurationMs: downloadDuration,
        });
      } else {
        // For S3 or other storage, use signed URL
        const fileUrl = await attachment.signedUrl;
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          throw new Error(
            `Failed to download file: ${fileResponse.statusText}`
          );
        }
        fileBuffer = await fileResponse.buffer();
        downloadDuration = Date.now() - downloadStartTime;
        Logger.info("task", "Downloaded audio file from URL", {
          jobId,
          fileSizeBytes: fileBuffer.length,
          downloadDurationMs: downloadDuration,
          statusCode: fileResponse.status,
        });
      }

      // Create form data
      const formDataStartTime = Date.now();
      const form = new FormData();
      form.append("audio", fileBuffer, {
        filename: attachment.name,
        contentType: attachment.contentType,
      });
      const formDataDuration = Date.now() - formDataStartTime;

      Logger.info("task", "Created FormData for transcription request", {
        jobId,
        attachmentId,
        fileName: attachment.name,
        contentType: attachment.contentType,
        bufferSizeBytes: fileBuffer.length,
        formDataCreationMs: formDataDuration,
      });

      Logger.info("task", "Sending transcription request to ASR server", {
        jobId,
        attachmentId,
        endpoint: transcriptionEndpoint,
        fileSizeBytes: fileBuffer.length,
        fileName: attachment.name,
      });

      // Send to transcription service
      const requestStartTime = Date.now();
      const response = await fetch(transcriptionEndpoint, {
        method: "POST",
        body: form,
        headers: form.getHeaders(),
      });
      const requestDuration = Date.now() - requestStartTime;

      Logger.info("task", "Received response from ASR server", {
        jobId,
        attachmentId,
        statusCode: response.status,
        statusText: response.statusText,
        requestDurationMs: requestDuration,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(
          "Transcription service error",
          new Error(`Status ${response.status}: ${errorText}`),
          {
            jobId,
            attachmentId,
            status: response.status,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500), // Limit error text length
            requestDurationMs: requestDuration,
          }
        );
        throw new Error(`Transcription service failed: ${response.statusText}`);
      }

      const parseStartTime = Date.now();
      const result = await response.json();
      const parseDuration = Date.now() - parseStartTime;

      Logger.info("task", "Parsed transcription result from ASR server", {
        jobId,
        attachmentId,
        parseDurationMs: parseDuration,
        hasText: !!result.text,
        textLength: result.text?.length || 0,
        hasSpeakerSegments: !!result.speaker_segments,
        speakerSegmentCount: result.speaker_segments?.length || 0,
        resultKeys: Object.keys(result),
      });

      // Log speaker segment details if available
      if (result.speaker_segments && result.speaker_segments.length > 0) {
        const uniqueSpeakers = new Set(
          result.speaker_segments.map((seg: any) => seg.spk)
        );
        Logger.info("task", "Speaker segment analysis", {
          jobId,
          uniqueSpeakerCount: uniqueSpeakers.size,
          uniqueSpeakers: Array.from(uniqueSpeakers),
          firstSegment: result.speaker_segments[0],
          lastSegment:
            result.speaker_segments[result.speaker_segments.length - 1],
        });
      }

      // Mark job as completed with result
      const dbUpdateStartTime = Date.now();
      await job.complete({
        text: result.text || "",
        speakerSegments: result.speaker_segments || [],
      });
      const dbUpdateDuration = Date.now() - dbUpdateStartTime;

      Logger.info("task", "Updated job status to completed in database", {
        jobId,
        attachmentId,
        dbUpdateDurationMs: dbUpdateDuration,
      });

      if (job.metadata?.autoSummary) {
        Logger.info("task", "Scheduling auto summary generation", {
          jobId,
        });
        await new AutoSummaryTask().schedule({ jobId: job.id });
      }

      // Calculate total processing time
      const totalDuration = Date.now() - requestStartTime + downloadDuration;
      Logger.info("task", "Transcription task completed successfully", {
        jobId,
        attachmentId,
        totalDurationMs: totalDuration,
        downloadDurationMs: downloadDuration,
        asrRequestDurationMs: requestDuration,
        parseDurationMs: parseDuration,
        dbUpdateDurationMs: dbUpdateDuration,
        fileSizeBytes: fileBuffer.length,
        textLength: result.text?.length || 0,
        speakerSegmentCount: result.speaker_segments?.length || 0,
      });

      // Delete audio file after transcription if configured
      if (env.TRANSCRIPTION_DELETE_AUDIO_AFTER) {
        try {
          await attachment.destroy();
          Logger.info("task", "Audio file deleted after transcription", {
            jobId,
            attachmentId,
          });
        } catch (deleteError) {
          // Log but don't fail the task if deletion fails
          Logger.error(
            "Failed to delete audio file after transcription",
            deleteError as Error,
            {
              jobId,
              attachmentId,
            }
          );
        }
      }
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));

      Logger.error("Transcription task failed", wrappedError, {
        jobId,
        attachmentId,
        userId,
        documentId,
      });

      // Determine error message
      let errorMessage = wrappedError.message;
      if (
        wrappedError.message.includes("ECONNREFUSED") ||
        wrappedError.message.includes("ENOTFOUND")
      ) {
        errorMessage =
          "Transcription service is not available. Please check the service configuration.";
      }

      // Update job status to failed
      await job.fail(errorMessage);

      // Re-throw to trigger retry logic
      throw wrappedError;
    }
  }

  /**
   * Handle final failure when all retry attempts are exhausted.
   */
  public async onFailed(props: Props): Promise<void> {
    const { jobId, attachmentId } = props;

    Logger.error(
      "Transcription task failed after all retry attempts",
      new Error("Max retries exhausted"),
      {
        jobId,
        attachmentId,
      }
    );

    try {
      const job = await TranscriptionJob.findByPk(jobId);
      if (job && job.status !== TranscriptionJobStatus.Failed) {
        await job.fail(
          "Transcription failed after multiple attempts. Please try again later."
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
    };
  }
}
