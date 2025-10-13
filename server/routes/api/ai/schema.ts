import { z } from "zod";

export const GenerateSchema = z.object({
  body: z.object({
    prompt: z.string().min(1).max(4000),
  }),
});

export type GenerateReq = z.infer<typeof GenerateSchema>;

export type GenerateRes = {
  data: {
    text: string;
  };
};

export const MeetingSummarySchema = z.object({
  body: z.object({
    transcript: z.string().min(1).max(50000),
    prompt: z.string().optional(),
  }),
});

export type MeetingSummaryReq = z.infer<typeof MeetingSummarySchema>;

export type MeetingSummaryRes = {
  data: {
    summary: string;
  };
};
