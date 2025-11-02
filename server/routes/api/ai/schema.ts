import { z } from "zod";
import { StatusFilter } from "@shared/types";
import { BaseSchema } from "../schema";

export const AiGenerateSchema = BaseSchema.extend({
  body: z.object({
    prompt: z.string(),
    context: z.string().optional(),
    mentionedDocumentIds: z.array(z.string()).optional(),
  }),
});

export type AiGenerateReq = z.infer<typeof AiGenerateSchema>;

export const AiSearchSchema = BaseSchema.extend({
  body: z.object({
    query: z.string().refine((val) => val.trim() !== ""),
    collectionId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    dateFilter: z
      .union([
        z.literal("day"),
        z.literal("week"),
        z.literal("month"),
        z.literal("year"),
      ])
      .optional(),
    statusFilter: z.nativeEnum(StatusFilter).array().optional(),
    maxDocuments: z.number().min(1).max(10).default(5),
  }),
});

export type AiSearchReq = z.infer<typeof AiSearchSchema>;
