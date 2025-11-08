import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const AiSearchSchema = BaseSchema.extend({
  body: z.object({
    query: z.string(),
    collectionId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    dateFilter: z.string().optional(),
    statusFilter: z.array(z.string()).optional(),
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
    metadata: z.record(z.any()).optional(),
  }),
});

export type AiGenerateReq = z.infer<typeof AiGenerateSchema>;

export const AiSummaryStatusSchema = BaseSchema.extend({
  body: z.object({
    jobId: z.string().uuid(),
  }),
});

export type AiSummaryStatusReq = z.infer<typeof AiSummaryStatusSchema>;

export const AiAskSchema = BaseSchema.extend({
  body: z.object({
    query: z.string().min(1).max(500),
    collectionId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    dateFilter: z.string().optional(),
    statusFilter: z.array(z.string()).optional(),
    maxDocuments: z.number().int().min(1).max(50).optional(),
    language: z.string().optional(),
    sessionId: z.string().uuid().optional(),
    conversationHistory: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .max(10)
      .optional(),
  }),
});

export type AiAskReq = z.infer<typeof AiAskSchema>;
