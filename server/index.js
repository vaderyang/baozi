// @flow
import env from "./env"; // eslint-disable-line import/order
import "./tracing"; // must come before importing any instrumented module

import http from "http";
import Koa from "koa";
import compress from "koa-compress";
import helmet from "koa-helmet";
import logger from "koa-logger";
import onerror from "koa-onerror";
import Router from "koa-router";
import { uniq } from "lodash";
import stoppable from "stoppable";
import throng from "throng";
import Logger from "./logging/logger";
import { requestErrorHandler } from "./logging/sentry";
import services from "./services";
import { getArg } from "./utils/args";
import { checkEnv, checkMigrations } from "./utils/startup";
import { checkUpdates } from "./utils/updates";

// If a services flag is passed it takes priority over the enviroment variable
// for example: --services=web,worker
const normalizedServiceFlag = getArg("services");

// The default is to run all services to make development and OSS installations
// easier to deal with. Separate services are only needed at scale.
const serviceNames = uniq(
  (
    normalizedServiceFlag ||
    env.SERVICES ||
    "collaboration,websockets,worker,web"
  )
    .split(",")
    .map((service) => service.trim())
);

// The number of processes to run, defaults to the number of CPU's available
// for the web service, and 1 for collaboration during the beta period.
let processCount = env.WEB_CONCURRENCY || undefined;

if (serviceNames.includes("collaboration")) {
  if (env.WEB_CONCURRENCY !== 1) {
    Logger.info(
      "lifecycle",
      "Note: Restricting process count to 1 due to use of collaborative service"
    );
  }
  processCount = 1;
}

// This function will only be called once in the original process
function master() {
  checkEnv();
  checkMigrations();

  if (env.ENABLE_UPDATES !== "false" && process.env.NODE_ENV === "production") {
    checkUpdates();
    setInterval(checkUpdates, 24 * 3600 * 1000);
  }
}

// This function will only be called in each forked process
async function start(id: string, disconnect: () => void) {
  // If a --port flag is passed then it takes priority over the env variable
  const normalizedPortFlag = getArg("port", "p");

  const app = new Koa();
  const server = stoppable(http.createServer(app.callback()));
  const router = new Router();

  // install basic middleware shared by all services
  if ((env.DEBUG || "").includes("http")) {
    app.use(logger((str, args) => Logger.info("http", str)));
  }
  app.use(compress());
  app.use(helmet());

  // catch errors in one place, automatically set status and response headers
  onerror(app);
  app.on("error", requestErrorHandler);

  // install health check endpoint for all services
  router.get("/_health", (ctx) => (ctx.body = "OK"));
  app.use(router.routes());

  // loop through requested services at startup
  for (const name of serviceNames) {
    if (!Object.keys(services).includes(name)) {
      throw new Error(`Unknown service ${name}`);
    }

    Logger.info("lifecycle", `Starting ${name} service`);
    const init = services[name];
    await init(app, server);
  }

  server.on("error", (err) => {
    throw err;
  });

  server.on("listening", () => {
    const address = server.address();
    Logger.info("lifecycle", `Listening on http://localhost:${address.port}`);
  });

  server.listen(normalizedPortFlag || env.PORT || "3000");

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  function shutdown() {
    Logger.info("lifecycle", "Stopping server");

    server.emit("shutdown");
    server.stop(disconnect);
  }
}

throng({
  master,
  worker: start,
  count: processCount,
});
