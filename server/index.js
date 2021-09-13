// @flow
import env from "./env"; // eslint-disable-line import/order
import "./tracing"; // must come before importing any instrumented module

import http from "http";
import debug from "debug";
import Koa from "koa";
import compress from "koa-compress";
import helmet from "koa-helmet";
import logger from "koa-logger";
import onerror from "koa-onerror";
import Router from "koa-router";
import { uniq } from "lodash";
import stoppable from "stoppable";
import throng from "throng";
import services from "./services";
import { getArg } from "./utils/args";
import { requestErrorHandler } from "./utils/sentry";
import { checkEnv, checkMigrations } from "./utils/startup";
import { checkUpdates } from "./utils/updates";

// If a services flag is passed it takes priority over the enviroment variable
// for example: --services=web,worker
const normalizedServiceFlag = getArg("services");

// The default is to run all services to make development and OSS installations
// easier to deal with. Separate services are only needed at scale.
const serviceNames = uniq(
  (normalizedServiceFlag || env.SERVICES || "websockets,worker,web")
    .split(",")
    .map((service) => service.trim())
);

// The number of processes to run, defaults to the number of CPU's available
// for the web service, and 1 for collaboration during the beta period.
const processCount = serviceNames.includes("collaboration")
  ? 1
  : env.WEB_CONCURRENCY || undefined;

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
  const httpLogger = debug("http");
  const log = debug("server");
  const router = new Router();

  // install basic middleware shared by all services
  app.use(logger((str, args) => httpLogger(str)));
  app.use(compress());
  app.use(helmet());

  // catch errors in one place, automatically set status and response headers
  onerror(app);
  app.on("error", requestErrorHandler);

  // install health check endpoint for all services
  router.get("/_health", (ctx) => (ctx.body = "OK"));
  app.use(router.routes());

  if (
    serviceNames.includes("websockets") &&
    serviceNames.includes("collaboration")
  ) {
    throw new Error(
      "Cannot run websockets and collaboration services in the same process"
    );
  }

  // loop through requested services at startup
  for (const name of serviceNames) {
    if (!Object.keys(services).includes(name)) {
      throw new Error(`Unknown service ${name}`);
    }

    log(`Starting ${name} service…`);
    const init = services[name];
    await init(app, server);
  }

  server.on("error", (err) => {
    throw err;
  });

  server.on("listening", () => {
    const address = server.address();
    console.log(`\n> Listening on http://localhost:${address.port}\n`);
  });

  server.listen(normalizedPortFlag || env.PORT || "3000");

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  function shutdown() {
    console.log("\n> Stopping server");
    server.stop(disconnect);
  }
}

throng({
  master,
  worker: start,
  count: processCount,
});
