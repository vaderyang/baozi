import { z } from "zod";
import { BaseSchema } from "../schema";

export const TranscribeSchema = BaseSchema.extend({
  body: z.object({
    attachmentId: z.string().uuid(),
  }),
});

export type TranscribeReq = z.infer<typeof TranscribeSchema>;
