import type { Next } from "koa";
import { Scope } from "@shared/types";
import env from "@server/env";
import AuthenticationHelper from "@shared/helpers/AuthenticationHelper";
import { AppContext } from "@server/types";
import {
  generateRawToken,
  bundleToken,
  unbundleToken,
} from "@server/utils/csrf";
import { getCookieDomain } from "@shared/utils/domains";
import { CSRF } from "@shared/constants";
import { CSRFError } from "@server/errors";
import { parseAuthentication } from "./authentication";

/**
 * Middleware that generates and attaches CSRF tokens for safe methods
 */
export function attachCSRFToken() {
  return async function attachCSRFTokenMiddleware(ctx: AppContext, next: Next) {
    // Only attach tokens for safe methods that don't mutate state
    if (["GET", "HEAD", "OPTIONS"].includes(ctx.method)) {
      // Check if a valid CSRF token already exists
      const existingToken = ctx.cookies.get(CSRF.cookieName);

      // Only generate a new token if one doesn't exist or is invalid
      if (!existingToken || !unbundleToken(existingToken, env.SECRET_KEY).valid) {
        const raw = generateRawToken(16);
        const bundled = bundleToken(raw, env.SECRET_KEY);

        // Set cookie that JavaScript can read (not HttpOnly)
        ctx.cookies.set(CSRF.cookieName, bundled, {
          httpOnly: false,
          sameSite: "lax",
          domain: getCookieDomain(ctx.request.hostname, env.isCloudHosted),
        });
      }
    }

    await next();
  };
}

/**
 * Middleware that verifies CSRF tokens for mutating requests
 */
export function verifyCSRFToken() {
  /**
   * Determines if a request requires CSRF protection
   */
  const shouldProtectRequest = (ctx: AppContext): boolean => {
    // Skip if not a potentially mutating method
    if (["GET", "HEAD", "OPTIONS"].includes(ctx.method)) {
      return false;
    }

    // If not using cookie-based auth, skip CSRF protection
    const { transport } = parseAuthentication(ctx);
    if (transport !== "cookie") {
      return false;
    }

    // For API routes, use AuthenticationHelper to determine if the operation is read-only
    if (ctx.originalUrl.startsWith("/api/")) {
      const canAccessWithReadOnly = AuthenticationHelper.canAccess(ctx.path, [
        Scope.Read,
      ]);

      // If it can be accessed with read-only scope, it doesn't need CSRF protection
      if (canAccessWithReadOnly) {
        return false;
      }
    }

    // Protect all other mutating requests
    return true;
  };

  return async function verifyCSRFTokenMiddleware(ctx: AppContext, next: Next) {
    if (!shouldProtectRequest(ctx)) {
      await next();
      return;
    }

    // Get token from cookie
    const cookieVal = ctx.cookies.get(CSRF.cookieName);
    if (!cookieVal) {
      Logger.error(
        `CSRF token missing from cookie for ${ctx.method} ${ctx.path}`,
        new Error("CSRF token missing from cookie"),
        {
          cookies: ctx.headers.cookie,
          hostname: ctx.request.hostname,
        }
      );
      throw CSRFError("CSRF token missing from cookie");
    }

    // Get token from header or form field depending on type
    // Access the already-parsed body from koa-body middleware
    const inputVal =
      ctx.get(CSRF.headerName) || ctx.request.body?.[CSRF.fieldName];

    if (!inputVal) {
      Logger.error(
        `CSRF token missing from request for ${ctx.method} ${ctx.path}`,
        new Error("CSRF token missing from request"),
        {
          headerName: CSRF.headerName,
          hasHeader: !!ctx.get(CSRF.headerName),
          hasBodyField: !!ctx.request.body?.[CSRF.fieldName],
        }
      );
      throw CSRFError("CSRF token missing from request");
    }

    // Verify both tokens are valid HMAC-signed tokens
    const { valid: cookieValid } = unbundleToken(cookieVal, env.SECRET_KEY);
    const { valid: inputValid } = unbundleToken(inputVal, env.SECRET_KEY);

    if (!cookieValid || !inputValid) {
      Logger.error(
        `CSRF token invalid for ${ctx.method} ${ctx.path}`,
        new Error("CSRF token invalid or malformed"),
        {
          cookieValid,
          inputValid,
          cookieToken: cookieVal?.substring(0, 20) + "...",
          inputToken: inputVal?.substring(0, 20) + "...",
        }
      );
      throw CSRFError("CSRF token invalid or malformed");
    }

    // Verify tokens match (double-submit check)
    if (cookieVal !== inputVal) {
      Logger.error(
        `CSRF token mismatch for ${ctx.method} ${ctx.path}`,
        new Error("CSRF token mismatch"),
        {
          cookieToken: cookieVal?.substring(0, 20) + "...",
          inputToken: inputVal?.substring(0, 20) + "...",
        }
      );
      throw CSRFError("CSRF token mismatch");
    }

    await next();
  };
}
