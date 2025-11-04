import FormData from "form-data";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { Attachment, TranscriptionJob } from "@server/models";
import { TranscriptionJobStatus } from "@server/models/TranscriptionJob";
import fetch from "@server/utils/fetch";
import BaseTask, { TaskPriority } from "./BaseTask";

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

        try {
            // Update job status to processing
            await job.updateStatus(TranscriptionJobStatus.Processing);

            Logger.info("task", "Downloading audio file", {
                jobId,
                attachmentId,
                fileName: attachment.name,
            });

            // Get the file buffer
            let fileBuffer: Buffer;

            // For LocalStorage, read directly from disk to avoid localhost DNS issues
            if (env.FILE_STORAGE === "local" && attachment.key) {
                const fs = await import("fs/promises");
                const path = await import("path");
                const filePath = path.join(env.FILE_STORAGE_LOCAL_ROOT_DIR, attachment.key);
                fileBuffer = await fs.readFile(filePath);
                Logger.info("task", "Read audio file from local storage", {
                    jobId,
                    filePath,
                });
            } else {
                // For S3 or other storage, use signed URL
                const fileUrl = await attachment.signedUrl;
                const fileResponse = await fetch(fileUrl);
                if (!fileResponse.ok) {
                    throw new Error(`Failed to download file: ${fileResponse.statusText}`);
                }
                fileBuffer = await fileResponse.buffer();
                Logger.info("task", "Downloaded audio file from URL", {
                    jobId,
                });
            }

            // Create form data
            const form = new FormData();
            form.append("audio", fileBuffer, {
                filename: attachment.name,
                contentType: attachment.contentType,
            });

            Logger.info("task", "Sending transcription request", {
                jobId,
                attachmentId,
                endpoint: env.TRANSCRIPTION_ENDPOINT,
            });

            // Send to transcription service
            const response = await fetch(env.TRANSCRIPTION_ENDPOINT, {
                method: "POST",
                body: form,
                headers: form.getHeaders(),
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
                    }
                );
                throw new Error(
                    `Transcription service failed: ${response.statusText}`
                );
            }

            const result = await response.json();

            Logger.info("task", "Transcription completed successfully", {
                jobId,
                attachmentId,
                textLength: result.text?.length || 0,
                speakerSegmentCount: result.speaker_segments?.length || 0,
            });

            // Mark job as completed with result
            await job.complete({
                text: result.text || "",
                speakerSegments: result.speaker_segments || [],
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
