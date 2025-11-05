/* oxlint-disable no-console */
import * as Sentry from "@sentry/react";
import env from "~/env";

type LogCategory =
  | "lifecycle"
  | "http"
  | "editor"
  | "router"
  | "collaboration"
  | "misc"
  | "store"
  | "plugins"
  | "policies"
  | "actions";

type Extra = Record<string, any>;

class Logger {
  private suppressedDebugCategories = new Set<LogCategory>(["collaboration"]);

  /**
   * Log information
   *
   * @param category A log message category that will be prepended
   * @param extra Arbitrary data to be logged that will appear in prod logs
   */
  info(label: LogCategory, message: string, extra?: Extra) {
    console.info(`[${label}] ${message}`, extra);
  }

  /**
   * Debug information
   *
   * @param category A log message category that will be prepended
   * @param extra Arbitrary data to be logged
   */
  debug(label: LogCategory, message: string, extra?: Extra) {
    if (
      this.suppressedDebugCategories.has(label) &&
      !this.debugLoggingEnabled
    ) {
      return;
    }

    if (env.ENVIRONMENT === "development" || this.debugLoggingEnabled) {
      console.debug(`[${label}] ${message}`, extra);
    }
  }

  /**
   * Log a warning
   *
   * @param message A warning message
   * @param extra Arbitrary data to be logged that will appear in prod logs
   */
  warn(message: string, extra?: Extra) {
    if (env.SENTRY_DSN) {
      Sentry.withScope(function (scope) {
        scope.setLevel("warning");

        for (const key in extra) {
          scope.setExtra(key, extra[key]);
        }

        Sentry.captureMessage(message);
      });
    }

    console.warn(message, extra);
  }

  /**
   * Report a runtime error
   *
   * @param message A description of the error
   * @param error The error that occurred
   * @param extra Arbitrary data to be logged that will appear in prod logs
   */
  error(message: string, error: Error, extra?: Extra) {
    if (env.SENTRY_DSN) {
      Sentry.withScope(function (scope) {
        scope.setLevel("error");

        for (const key in extra) {
          scope.setExtra(key, extra[key]);
        }

        Sentry.captureException(error);
      });
    }

    console.error(message, {
      error,
      extra,
    });
  }

  /**
   * Whether additional debug logging is shown in the console or not.
   */
  public debugLoggingEnabled = false;

  setSuppressedDebugCategories(categories: LogCategory[]) {
    this.suppressedDebugCategories = new Set(categories);
  }
}

export default new Logger();
