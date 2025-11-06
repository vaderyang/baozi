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
  error: string | null;
  result: TranscriptionResult | null;
  attachmentId: string;
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
    documentId: string
  ): Promise<TranscriptionJob> => {
    const response = await client.post<{
      data: { jobId: string; status: TranscriptionJobStatus };
    }>("/transcriptions.create", {
      attachmentId,
      documentId,
    });

    const job: TranscriptionJob = {
      id: response.data.jobId,
      documentId,
      status: response.data.status,
      progress: null,
      error: null,
      result: null,
      attachmentId,
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
   *
   * @param jobId The ID of the job to poll
   */
  @action
  private startPolling = (jobId: string): void => {
    // Don't start if already polling
    if (this.pollingIntervals.has(jobId)) {
      return;
    }

    // Poll every 2 seconds
    const interval = setInterval(() => {
      this.pollJobStatus(jobId);
    }, 2000);

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
