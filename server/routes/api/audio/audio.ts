import Router from "koa-router";
import { v4 as uuidv4 } from "uuid";
import formidable from "formidable";
import env from "@server/env";
import { InvalidRequestError, NotFoundError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import {
  Attachment,
  Collection,
  Document,
  TranscriptionJob,
} from "@server/models";
import {
  TranscriptionJobStatus,
  TranscriptionSourceType,
} from "@server/models/TranscriptionJob";
import { authorize } from "@server/policies";
import TranscriptionTask from "@server/queues/tasks/TranscriptionTask";
import { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import * as T from "./schema";

const router = new Router();

/**
 * Ensure the Audio Inbox collection exists for the user, creating it if necessary.
 */
async function ensureAudioInbox(
  userId: string,
  teamId: string
): Promise<Collection> {
  // Try to find existing Audio Inbox - private collections have permission = null
  let audioInbox = await Collection.findOne({
    where: {
      teamId,
      name: "Audio Inbox",
      permission: null,
    },
  });

  // Create if it doesn't exist
  if (!audioInbox) {
    audioInbox = await Collection.create({
      name: "Audio Inbox",
      description: "Your audio recordings and uploads",
      teamId,
      createdById: userId,
      permission: null, // null permission makes it private
      icon: "inbox",
    });

    Logger.info("utils", "Created Audio Inbox collection", {
      collectionId: audioInbox.id,
      userId,
      teamId,
    });
  }

  return audioInbox;
}

router.post(
  "audio.start-recording",
  rateLimiter(RateLimiterStrategy.TwentyFivePerMinute),
  auth(),
  validate(T.AudioStartRecordingSchema),
  async (ctx: APIContext<T.AudioStartRecordingReq>) => {
    const { user } = ctx.state.auth;
    const { title } = ctx.input.body;

    // Ensure Audio Inbox exists
    const audioInbox = await ensureAudioInbox(user.id, user.teamId);

    // Generate session ID
    const sessionId = uuidv4();

    // Create timestamp for default title
    const timestamp = new Date().toISOString();
    const defaultTitle = title || `Recording ${timestamp}`;

    // Create Audio Document in Audio Inbox
    const document = await Document.create({
      title: defaultTitle,
      collectionId: audioInbox.id,
      teamId: user.teamId,
      createdById: user.id,
      lastModifiedById: user.id,
      publishedAt: new Date(),
      audioMetadata: {
        sourceType: "recording",
      },
    });

    Logger.info("utils", "Started recording session", {
      documentId: document.id,
      sessionId,
      userId: user.id,
      collectionId: audioInbox.id,
    });

    ctx.body = {
      data: {
        documentId: document.id,
        sessionId,
        audioInboxId: audioInbox.id,
      },
    };
  }
);

router.post(
  "audio.stop-recording",
  rateLimiter(RateLimiterStrategy.TwentyFivePerMinute),
  auth(),
  async (ctx: APIContext) => {
    const { user } = ctx.state.auth;

    // Parse multipart form data
    const form = formidable({
      maxFileSize: env.MAXIMUM_IMPORT_SIZE,
      maxFiles: 1,
    });

    const [fields, files] = await new Promise<
      [formidable.Fields, formidable.Files]
    >((resolve, reject) => {
      form.parse(ctx.req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    // Extract fields
    const documentId = fields.documentId?.[0];
    const sessionId = fields.sessionId?.[0];
    const markersJson = fields.markers?.[0];

    if (!documentId || !sessionId) {
      throw InvalidRequestError("documentId and sessionId are required");
    }

    // Parse markers if provided
    let markers;
    if (markersJson) {
      try {
        markers = JSON.parse(markersJson);
      } catch (_error) {
        throw InvalidRequestError("Invalid markers JSON");
      }
    }

    // Get the audio file
    const audioBlob = files.audioBlob;
    const audioFile = Array.isArray(audioBlob) ? audioBlob[0] : audioBlob;
    if (!audioFile) {
      throw InvalidRequestError("audioBlob file is required");
    }

    // Find the document and verify access
    const document = await Document.findByPk(documentId, {
      userId: user.id,
    });

    if (!document) {
      throw NotFoundError("Document not found");
    }

    authorize(user, "update", document);

    // Verify the document belongs to the user
    if (document.createdById !== user.id) {
      throw InvalidRequestError(
        "You don't have permission to update this document"
      );
    }

    // Generate a unique key for the audio file
    const fileExtension =
      audioFile.originalFilename?.split(".").pop() || "webm";
    const key = `audio/${user.teamId}/${documentId}/${uuidv4()}.${fileExtension}`;

    // Create attachment
    const attachment = await Attachment.create({
      key,
      contentType: audioFile.mimetype || "audio/webm",
      size: audioFile.size,
      teamId: user.teamId,
      documentId: document.id,
      userId: user.id,
      acl: "private",
    });

    // Upload the file to storage
    await attachment.writeFile(audioFile);

    Logger.info("utils", "Uploaded audio file", {
      attachmentId: attachment.id,
      documentId: document.id,
      sessionId,
      size: audioFile.size,
      userId: user.id,
    });

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
      documentId: document.id,
      attachmentId: attachment.id,
      sourceType: TranscriptionSourceType.Recording,
      status: TranscriptionJobStatus.Queued,
      progress: null,
      error: null,
      result: null,
      metadata: {
        markers,
      },
    });

    // Update document audioMetadata with markers
    if (markers && markers.length > 0) {
      await document.update({
        audioMetadata: {
          ...document.audioMetadata,
          markers,
        },
      });
    }

    Logger.info("utils", "Created transcription job for recording", {
      jobId: job.id,
      attachmentId: attachment.id,
      documentId: document.id,
      sessionId,
      userId: user.id,
    });

    // Schedule the transcription task
    await new TranscriptionTask().schedule({
      jobId: job.id,
      attachmentId: attachment.id,
      userId: user.id,
      documentId: document.id,
    });

    Logger.info("utils", "Scheduled transcription task for recording", {
      jobId: job.id,
      attachmentId: attachment.id,
      documentId: document.id,
      sessionId,
      userId: user.id,
    });

    ctx.body = {
      data: {
        transcriptionJobId: job.id,
        attachmentId: attachment.id,
      },
    };
  }
);

export default router;
