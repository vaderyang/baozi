import Router from "koa-router";
import FormData from "form-data";
import env from "@server/env";
import fetch from "@server/utils/fetch";
import { InvalidRequestError, NotFoundError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { Attachment } from "@server/models";
import { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

router.post(
  "transcriptions.create",
  auth(),
  validate(T.TranscribeSchema),
  async (ctx: APIContext<T.TranscribeReq>) => {
    const { user } = ctx.state.auth;
    const { attachmentId } = ctx.input.body;

    // Find the attachment
    const attachment = await Attachment.findByPk(attachmentId);

    if (!attachment) {
      throw NotFoundError("Attachment not found");
    }

    // Verify user has access to the attachment
    if (attachment.teamId !== user.teamId) {
      throw InvalidRequestError("You don't have access to this attachment");
    }

    try {
      // Get the signed URL for the file
      const fileUrl = await attachment.signedUrl;

      Logger.info("utils", "Downloading audio file", {
        attachmentId,
        userId: user.id,
      });

      // Download the file
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.statusText}`);
      }

      const fileBuffer = await fileResponse.buffer();

      // Create form data
      const form = new FormData();
      form.append("audio", fileBuffer, {
        filename: attachment.name,
        contentType: attachment.contentType,
      });

      Logger.info("utils", "Sending transcription request", {
        attachmentId,
        endpoint: env.TRANSCRIPTION_ENDPOINT,
        userId: user.id,
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
            attachmentId,
            status: response.status,
            userId: user.id,
          }
        );
        throw InvalidRequestError(
          `Transcription service failed: ${response.statusText}`
        );
      }

      const result = await response.json();

      Logger.info("utils", "Transcription completed", {
        attachmentId,
        textLength: result.text?.length || 0,
        speakerSegmentCount: result.speaker_segments?.length || 0,
        userId: user.id,
      });

      // Delete audio file after transcription if configured
      if (env.TRANSCRIPTION_DELETE_AUDIO_AFTER) {
        try {
          await attachment.destroy();
          Logger.info("utils", "Audio file deleted after transcription", {
            attachmentId,
            userId: user.id,
          });
        } catch (deleteError) {
          // Log but don't fail the request if deletion fails
          Logger.error(
            "Failed to delete audio file after transcription",
            deleteError as Error,
            {
              attachmentId,
              userId: user.id,
            }
          );
        }
      }

      ctx.body = {
        data: {
          text: result.text || "",
          speakerSegments: result.speaker_segments || [],
          speakerStatistics: result.speaker_statistics || null,
        },
      };
    } catch (error: unknown) {
      const wrappedError =
        error instanceof Error ? error : new Error(String(error));
      Logger.error("Transcription failed", wrappedError, {
        attachmentId,
        userId: user.id,
      });

      if (
        wrappedError.message.includes("ECONNREFUSED") ||
        wrappedError.message.includes("ENOTFOUND")
      ) {
        throw InvalidRequestError(
          "Transcription service is not available. Please check the service configuration."
        );
      }

      throw InvalidRequestError(
        "Failed to transcribe audio: " + wrappedError.message
      );
    }
  }
);

export default router;
