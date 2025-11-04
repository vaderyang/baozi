import Router from "koa-router";
import env from "@server/env";
import { InvalidRequestError, NotFoundError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Attachment, Document, TranscriptionJob } from "@server/models";
import { TranscriptionJobStatus } from "@server/models/TranscriptionJob";
import { authorize } from "@server/policies";
import TranscriptionTask from "@server/queues/tasks/TranscriptionTask";
import { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import * as T from "./schema";

const router = new Router();

router.post(
  "transcriptions.create",
  rateLimiter(RateLimiterStrategy.TwentyFivePerMinute),
  auth(),
  validate(T.TranscribeSchema),
  async (ctx: APIContext<T.TranscribeReq>) => {
    const { user } = ctx.state.auth;
    const { attachmentId, documentId } = ctx.input.body;

    // Find the attachment
    const attachment = await Attachment.findByPk(attachmentId);

    if (!attachment) {
      throw NotFoundError("Attachment not found");
    }

    // Verify user has access to the attachment
    if (attachment.teamId !== user.teamId) {
      throw InvalidRequestError("You don't have access to this attachment");
    }

    // Find the document and verify access
    const document = await Document.findByPk(documentId, {
      userId: user.id,
    });

    if (!document) {
      throw NotFoundError("Document not found");
    }

    authorize(user, "update", document);

    // Check if user has reached the maximum number of concurrent transcription jobs
    const activeJobsCount = await TranscriptionJob.count({
      where: {
        userId: user.id,
        status: [
          TranscriptionJobStatus.Queued,
          TranscriptionJobStatus.Processing,
        ],
      },
    });

    if (activeJobsCount >= env.TRANSCRIPTION_MAX_CONCURRENT_PER_USER) {
      throw InvalidRequestError(
        `You have reached the maximum number of concurrent transcription jobs (${env.TRANSCRIPTION_MAX_CONCURRENT_PER_USER}). Please wait for some jobs to complete before starting new ones.`
      );
    }

    // Create transcription job
    const job = await TranscriptionJob.create({
      teamId: user.teamId,
      userId: user.id,
      documentId,
      attachmentId,
      status: TranscriptionJobStatus.Queued,
      progress: null,
      error: null,
      result: null,
    });

    Logger.info("utils", "Created transcription job", {
      jobId: job.id,
      attachmentId,
      documentId,
      userId: user.id,
    });

    // Schedule the transcription task
    await new TranscriptionTask().schedule({
      jobId: job.id,
      attachmentId,
      userId: user.id,
      documentId,
    });

    Logger.info("utils", "Scheduled transcription task", {
      jobId: job.id,
      attachmentId,
      documentId,
      userId: user.id,
    });

    ctx.body = {
      data: {
        jobId: job.id,
        status: TranscriptionJobStatus.Queued,
      },
    };
  }
);

router.post(
  "transcriptions.info",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.TranscriptionInfoSchema),
  async (ctx: APIContext<T.TranscriptionInfoReq>) => {
    const { user } = ctx.state.auth;
    const { jobId } = ctx.input.body;

    // Find the transcription job
    const job = await TranscriptionJob.findByPk(jobId);

    if (!job) {
      throw NotFoundError("Transcription job not found");
    }

    // Verify user has access to the job's document
    const document = await Document.findByPk(job.documentId, {
      userId: user.id,
    });

    if (!document) {
      throw NotFoundError("Document not found");
    }

    authorize(user, "read", document);

    ctx.body = {
      data: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error,
        result: job.result,
      },
    };
  }
);

router.post(
  "transcriptions.retry",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  auth(),
  validate(T.TranscriptionRetrySchema),
  async (ctx: APIContext<T.TranscriptionRetryReq>) => {
    const { user } = ctx.state.auth;
    const { jobId } = ctx.input.body;

    // Find the transcription job
    const job = await TranscriptionJob.findByPk(jobId);

    if (!job) {
      throw NotFoundError("Transcription job not found");
    }

    // Verify user owns the job
    if (job.userId !== user.id) {
      throw InvalidRequestError("You don't have permission to retry this job");
    }

    // Verify job is in failed state
    if (job.status !== TranscriptionJobStatus.Failed) {
      throw InvalidRequestError("Only failed jobs can be retried");
    }

    // Check if user has reached the maximum number of concurrent transcription jobs
    const activeJobsCount = await TranscriptionJob.count({
      where: {
        userId: user.id,
        status: [
          TranscriptionJobStatus.Queued,
          TranscriptionJobStatus.Processing,
        ],
      },
    });

    if (activeJobsCount >= env.TRANSCRIPTION_MAX_CONCURRENT_PER_USER) {
      throw InvalidRequestError(
        `You have reached the maximum number of concurrent transcription jobs (${env.TRANSCRIPTION_MAX_CONCURRENT_PER_USER}). Please wait for some jobs to complete before retrying.`
      );
    }

    // Create a new transcription job using the existing attachment
    const newJob = await TranscriptionJob.create({
      teamId: job.teamId,
      userId: job.userId,
      documentId: job.documentId,
      attachmentId: job.attachmentId,
      status: TranscriptionJobStatus.Queued,
      progress: null,
      error: null,
      result: null,
    });

    Logger.info("utils", "Created retry transcription job", {
      originalJobId: jobId,
      newJobId: newJob.id,
      attachmentId: job.attachmentId,
      documentId: job.documentId,
      userId: user.id,
    });

    // Schedule the new transcription task
    await new TranscriptionTask().schedule({
      jobId: newJob.id,
      attachmentId: job.attachmentId,
      userId: job.userId,
      documentId: job.documentId,
    });

    Logger.info("utils", "Scheduled retry transcription task", {
      originalJobId: jobId,
      newJobId: newJob.id,
      attachmentId: job.attachmentId,
      documentId: job.documentId,
      userId: user.id,
    });

    ctx.body = {
      data: {
        jobId: newJob.id,
        status: TranscriptionJobStatus.Queued,
      },
    };
  }
);

router.post(
  "transcriptions.cancel",
  rateLimiter(RateLimiterStrategy.TwentyFivePerMinute),
  auth(),
  validate(T.TranscriptionCancelSchema),
  async (ctx: APIContext<T.TranscriptionCancelReq>) => {
    const { user } = ctx.state.auth;
    const { jobId } = ctx.input.body;

    // Find the transcription job
    const job = await TranscriptionJob.findByPk(jobId);

    if (!job) {
      throw NotFoundError("Transcription job not found");
    }

    // Verify user owns the job
    if (job.userId !== user.id) {
      throw InvalidRequestError("You don't have permission to cancel this job");
    }

    // Verify job is in queued or processing state
    if (
      job.status !== TranscriptionJobStatus.Queued &&
      job.status !== TranscriptionJobStatus.Processing
    ) {
      throw InvalidRequestError(
        "Only queued or processing jobs can be cancelled"
      );
    }

    // Update job status to cancelled
    await job.updateStatus(TranscriptionJobStatus.Cancelled);

    Logger.info("utils", "Cancelled transcription job", {
      jobId: job.id,
      attachmentId: job.attachmentId,
      documentId: job.documentId,
      userId: user.id,
    });

    // Optionally delete audio file based on config
    if (env.TRANSCRIPTION_DELETE_AUDIO_AFTER) {
      try {
        const attachment = await Attachment.findByPk(job.attachmentId);
        if (attachment) {
          await attachment.destroy();
          Logger.info("utils", "Audio file deleted after cancellation", {
            jobId: job.id,
            attachmentId: job.attachmentId,
            userId: user.id,
          });
        }
      } catch (deleteError) {
        // Log but don't fail the request if deletion fails
        Logger.error(
          "Failed to delete audio file after cancellation",
          deleteError as Error,
          {
            jobId: job.id,
            attachmentId: job.attachmentId,
            userId: user.id,
          }
        );
      }
    }

    ctx.body = {
      data: {
        success: true,
      },
    };
  }
);

router.post(
  "transcriptions.list",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.TranscriptionListSchema),
  async (ctx: APIContext<T.TranscriptionListReq>) => {
    const { user } = ctx.state.auth;
    const { documentId } = ctx.input.body;

    // Find the document and verify access
    const document = await Document.findByPk(documentId, {
      userId: user.id,
    });

    if (!document) {
      throw NotFoundError("Document not found");
    }

    authorize(user, "read", document);

    // Query pending transcription jobs for this document
    const jobs = await TranscriptionJob.findPending({
      documentId,
    });

    // Load attachment information for each job
    const jobsWithAttachments = await Promise.all(
      jobs.map(async (job) => {
        const attachment = await Attachment.findByPk(job.attachmentId);
        return {
          id: job.id,
          status: job.status,
          progress: job.progress,
          error: job.error,
          fileName: attachment?.name || "Unknown",
          fileSize: attachment?.size || 0,
        };
      })
    );

    ctx.body = {
      data: jobsWithAttachments,
    };
  }
);

export default router;
