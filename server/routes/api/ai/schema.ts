import { z } from "zod";
import { BaseSchema } from "../schema";

export const AiGenerateSchema = BaseSchema.extend({
  body: z.object({
    prompt: z.string(),
    context: z.string().optional(),
  }),
});

export type AiGenerateReq = z.infer<typeof AiGenerateSchema>;
