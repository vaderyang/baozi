import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const AiSearchSchema = BaseSchema.extend({
  body: z.object({
    query: z.string(),
    collectionId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    dateFilter: z.string().optional(),
    statusFilter: z.string().optional(),
    maxDocuments: z.number().int().min(1).max(50).optional(),
    language: z.string().optional(),
  }),
});

export type AiSearchReq = z.infer<typeof AiSearchSchema>;

export const AiGenerateSchema = BaseSchema.extend({
  body: z.object({
    prompt: z.string(),
    context: z.string().optional(),
    mentionedDocumentIds: z.array(z.string().uuid()).optional(),
    mode: z.enum(["fast", "sensitive", "vision"]).optional(),
  }),
});

export type AiGenerateReq = z.infer<typeof AiGenerateSchema>;
