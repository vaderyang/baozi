import { action, computed, observable, runInAction } from "mobx";
import { client } from "~/utils/ApiClient";
import type RootStore from "./RootStore";

export enum TranscriptionJobStatus {
  Queued = "queued",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export type TranscriptionResult = {
  text: string;
  speakerSegments?: Array<{
    spk: number;
    text: string;
    start?: number;
    end?: number;
    timestamp?: number[][];
  }>;
};

export interface TranscriptionJob {
  id: string;
  documentId: string;
  status: TranscriptionJobStatus;
  progress: number | null;
  message?: string | null;
  error: string | null;
  result: TranscriptionResult | null;
  attachmentId: string;
  sourceType?: "recording" | "upload" | "url";
  autoSummary?: boolean;
  startedAt?: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
}

/**
 * TranscriptionJobsStore manages transcription jobs for audio documents.
 * It handles creating jobs, polling for status updates, and managing job lifecycle.
 */
class TranscriptionJobsStore {
  @observable
  jobs = new Map<string, TranscriptionJob>();

  @observable
  pollingIntervals = new Map<string, NodeJS.Timeout>();

  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
  }

  /**
   * Create a new transcription job for an attachment and document.
   *
   * @param attachmentId The ID of the audio attachment
   * @param documentId The ID of the document
   * @returns The created transcription job
   */
  @action
  createJob = async (
    attachmentId: string,
    documentId: string,
    options?: {
      sourceType?: "recording" | "upload" | "url";
      autoSummary?: boolean;
    }
  ): Promise<TranscriptionJob> => {
    const response = await client.post<{
      data: { jobId: string; status: TranscriptionJobStatus };
    }>("/transcriptions.create", {
      attachmentId,
      documentId,
      autoSummary: options?.autoSummary ?? false,
    });

    const job: TranscriptionJob = {
      id: response.data.jobId,
      documentId,
      status: response.data.status,
      progress: null,
      error: null,
      result: null,
      attachmentId,
      sourceType: options?.sourceType,
      autoSummary: options?.autoSummary ?? false,
    };

    runInAction(() => {
      this.jobs.set(job.id, job);
    });

    // Start polling for this job
    this.startPolling(job.id);

    return job;
  };

  /**
   * Poll for the status of a transcription job.
   *
   * @param jobId The ID of the job to poll
   */
  @action
  pollJobStatus = async (jobId: string): Promise<void> => {
    try {
      const response = await client.post<{ data: TranscriptionJob }>(
        "/transcriptions.info",
        {
          jobId,
        }
      );

      runInAction(() => {
        const existingJob = this.jobs.get(jobId);
        if (existingJob) {
          // Update the job with new data
          this.jobs.set(jobId, {
            ...existingJob,
            ...response.data,
            autoSummary: response.data.autoSummary ?? existingJob.autoSummary,
          });

          // Stop polling if job is in a terminal state
          if (
            response.data.status === TranscriptionJobStatus.Completed ||
            response.data.status === TranscriptionJobStatus.Failed ||
            response.data.status === TranscriptionJobStatus.Cancelled
          ) {
            this.stopPolling(jobId);
          }
        }
      });
    } catch (_error) {
      // Log error but don't stop polling - the job might still be processing
      // Silently continue polling
    }
  };

  /**
   * Start polling for a job's status updates.
   * NOTE: Polling is now only used as a fallback when WebSocket is disconnected.
   * Real-time updates come via WebSocket events.
   *
   * @param jobId The ID of the job to poll
   */
  @action
  private startPolling = (jobId: string): void => {
    // Don't start if already polling
    if (this.pollingIntervals.has(jobId)) {
      return;
    }

    // Check if WebSocket is connected - if so, rely on events instead
    const isWebSocketConnected = this.rootStore.websockets?.connected;
    if (isWebSocketConnected) {
      // WebSocket will handle updates, no need to poll
      return;
    }

    // Poll every 5 seconds (reduced frequency since it's only a fallback)
    const interval = setInterval(() => {
      this.pollJobStatus(jobId);
    }, 5000);

    this.pollingIntervals.set(jobId, interval);

    // Do an immediate poll
    this.pollJobStatus(jobId);
  };

  /**
   * Stop polling for a job's status updates.
   *
   * @param jobId The ID of the job to stop polling
   */
  @action
  private stopPolling = (jobId: string): void => {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
  };

  /**
   * Retry a failed transcription job.
   *
   * @param jobId The ID of the job to retry
   * @returns The new transcription job
   */
  @action
  retryJob = async (jobId: string): Promise<TranscriptionJob> => {
    const response = await client.post<{
      data: { jobId: string; status: TranscriptionJobStatus };
    }>("/transcriptions.retry", {
      jobId,
    });

    const oldJob = this.jobs.get(jobId);
    if (!oldJob) {
      throw new Error("Job not found");
    }

    const newJob: TranscriptionJob = {
      id: response.data.jobId,
      documentId: oldJob.documentId,
      status: response.data.status,
      progress: null,
      error: null,
      result: null,
      attachmentId: oldJob.attachmentId,
      sourceType: oldJob.sourceType,
      autoSummary: oldJob.autoSummary,
    };

    runInAction(() => {
      this.jobs.set(newJob.id, newJob);
    });

    // Start polling for the new job
    this.startPolling(newJob.id);

    return newJob;
  };

  /**
   * Cancel a queued or processing transcription job.
   *
   * @param jobId The ID of the job to cancel
   */
  @action
  cancelJob = async (jobId: string): Promise<void> => {
    await client.post("/transcriptions.cancel", {
      jobId,
    });

    runInAction(() => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = TranscriptionJobStatus.Cancelled;
        this.jobs.set(jobId, job);
      }
    });

    // Stop polling
    this.stopPolling(jobId);
  };

  /**
   * Update a job from a WebSocket event.
   * This is the primary way jobs are updated in real-time.
   *
   * @param eventData The event data from the WebSocket
   */
  @action
  updateJobFromEvent = (eventData: any): void => {
    const {
      jobId,
      status,
      progress,
      message,
      error,
      result,
      startedAt,
      completedAt,
      failedAt,
    } = eventData;

    let job = this.jobs.get(jobId);

    if (!job) {
      // Job doesn't exist in store yet, create a minimal entry
      job = {
        id: jobId,
        documentId: eventData.documentId,
        status,
        progress: progress ?? null,
        message: message ?? null,
        error: error ?? null,
        result: result ?? null,
        attachmentId: eventData.attachmentId || "",
        startedAt: startedAt ? new Date(startedAt) : null,
        completedAt: completedAt ? new Date(completedAt) : null,
        failedAt: failedAt ? new Date(failedAt) : null,
      };
      this.jobs.set(jobId, job);
    } else {
      // Update existing job
      job.status = status || job.status;
      job.progress = progress !== undefined ? progress : job.progress;
      job.message = message !== undefined ? message : job.message;
      job.error = error !== undefined ? error : job.error;
      job.result = result !== undefined ? result : job.result;
      job.startedAt = startedAt ? new Date(startedAt) : job.startedAt;
      job.completedAt = completedAt ? new Date(completedAt) : job.completedAt;
      job.failedAt = failedAt ? new Date(failedAt) : job.failedAt;

      this.jobs.set(jobId, { ...job });
    }

    // If job is in a terminal state, stop any polling
    if (
      status === TranscriptionJobStatus.Completed ||
      status === TranscriptionJobStatus.Failed ||
      status === TranscriptionJobStatus.Cancelled
    ) {
      this.stopPolling(jobId);
    }
  };

  /**
   * Marks a completed job's result as consumed so observers don't reprocess it.
   *
   * @param jobId The ID of the job
   */
  @action
  markResultConsumed = (jobId: string): void => {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    this.jobs.set(jobId, {
      ...job,
      result: null,
    });
  };

  /**
   * Get a job by ID.
   *
   * @param jobId The ID of the job
   * @returns The job or undefined if not found
   */
  getJob = (jobId: string): TranscriptionJob | undefined =>
    this.jobs.get(jobId);

  /**
   * Get all jobs for a document.
   *
   * @param documentId The ID of the document
   * @returns Array of jobs for the document
   */
  getJobsForDocument = (documentId: string): TranscriptionJob[] =>
    Array.from(this.jobs.values()).filter(
      (job) => job.documentId === documentId
    );

  /**
   * Returns all active jobs (queued or processing).
   */
  @computed
  get activeJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) =>
        job.status === TranscriptionJobStatus.Queued ||
        job.status === TranscriptionJobStatus.Processing
    );
  }

  /**
   * Returns all completed jobs.
   */
  @computed
  get completedJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === TranscriptionJobStatus.Completed
    );
  }

  /**
   * Returns all failed jobs.
   */
  @computed
  get failedJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === TranscriptionJobStatus.Failed
    );
  }

  /**
   * Clean up all polling intervals when the store is destroyed.
   */
  cleanup = (): void => {
    this.pollingIntervals.forEach((interval) => clearInterval(interval));
    this.pollingIntervals.clear();
  };
}

export default TranscriptionJobsStore;
