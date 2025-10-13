import admin from "./admin";
import collaboration from "./collaboration";
import cron from "./cron";
import meetingAI from "./meetingAI";
import web from "./web";
import websockets from "./websockets";
import worker from "./worker";

export default {
  websockets,
  collaboration,
  meetingAI,
  admin,
  web,
  worker,
  cron,
} as const;
