import admin from "./admin";
import collaboration from "./collaboration";
import cron from "./cron";
import meetingai from "./meetingAI";
import web from "./web";
import websockets from "./websockets";
import worker from "./worker";

export default {
  websockets,
  collaboration,
  meetingai,
  admin,
  web,
  worker,
  cron,
} as const;
