import { z } from "zod";
import { BaseSchema } from "../schema";

export const AudioStartRecordingSchema = BaseSchema.extend({
  body: z.object({
    title: z.string().optional(),
  }),
});

export type AudioStartRecordingReq = z.infer<typeof AudioStartRecordingSchema>;
