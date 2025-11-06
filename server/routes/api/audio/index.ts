import Router from "koa-router";
import audio from "./audio";

const router = new Router();

router.use("/", audio.routes());

export default router;
