import { z } from "zod";
import { BaseSchema } from "../schema";

export const AudioStartRecordingSchema = BaseSchema.extend({
  body: z.object({
    title: z.string().optional(),
  }),
});

export type AudioStartRecordingReq = z.infer<typeof AudioStartRecordingSchema>;

export const AudioArchiveSuggestionSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
  }),
});

export type AudioArchiveSuggestionReq = z.infer<
  typeof AudioArchiveSuggestionSchema
>;

export const AudioAcceptSuggestionSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
    targetId: z.string().uuid(),
    targetType: z.enum(["collection", "document"]),
  }),
});

export type AudioAcceptSuggestionReq = z.infer<
  typeof AudioAcceptSuggestionSchema
>;
