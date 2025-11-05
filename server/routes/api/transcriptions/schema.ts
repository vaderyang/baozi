import { z } from "zod";
import { BaseSchema } from "../schema";

export const TranscribeSchema = BaseSchema.extend({
  body: z.object({
    attachmentId: z.string().uuid(),
    documentId: z.string().uuid(),
  }),
});

export type TranscribeReq = z.infer<typeof TranscribeSchema>;

export const TranscriptionInfoSchema = BaseSchema.extend({
  body: z.object({
    jobId: z.string().uuid(),
  }),
});

export type TranscriptionInfoReq = z.infer<typeof TranscriptionInfoSchema>;

export const TranscriptionRetrySchema = BaseSchema.extend({
  body: z.object({
    jobId: z.string().uuid(),
  }),
});

export type TranscriptionRetryReq = z.infer<typeof TranscriptionRetrySchema>;

export const TranscriptionCancelSchema = BaseSchema.extend({
  body: z.object({
    jobId: z.string().uuid(),
  }),
});

export type TranscriptionCancelReq = z.infer<typeof TranscriptionCancelSchema>;

export const TranscriptionListSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
  }),
});

export type TranscriptionListReq = z.infer<typeof TranscriptionListSchema>;
