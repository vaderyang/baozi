import passport from "@outlinewiki/koa-passport";
import { Context } from "koa";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { AuthenticationResult } from "@server/types";
import { signIn } from "@server/utils/authentication";
import { parseState } from "@server/utils/passport";

export default function createMiddleware(providerName: string) {
  return function passportMiddleware(ctx: Context) {
    return passport.authorize(
      providerName,
      {
        session: false,
      },
      async (err, user, result: AuthenticationResult) => {
        if (err) {
          Logger.error("Error during authentication", err);

          if (err.id) {
            const notice = err.id.replace(/_/g, "-");
            const redirectUrl = err.redirectUrl ?? "/";
            const hasQueryString = redirectUrl?.includes("?");

            // Every authentication action is routed through the apex domain.
            // But when there is an error, we want to redirect the user on the
            // same domain or subdomain that they originated from (found in state).

            // get original host
            const state = ctx.cookies.get("state");
            const host = state ? parseState(state).host : ctx.hostname;

            // form a URL object with the err.redirectUrl and replace the host
            const reqProtocol = ctx.protocol;
            const requestHost = ctx.get("host");
            const url = new URL(
              `${reqProtocol}://${requestHost}${redirectUrl}`
            );

            url.host = host;

            return ctx.redirect(
              `${url.toString()}${hasQueryString ? "&" : "?"}notice=${notice}`
            );
          }

          if (env.ENVIRONMENT === "development") {
            throw err;
          }

          return ctx.redirect(`/?notice=auth-error`);
        }

        // Passport.js may invoke this callback with err=null and user=null in
        // the event that error=access_denied is received from the OAuth server.
        // I'm not sure why this exception to the rule exists, but it does:
        // https://github.com/jaredhanson/passport-oauth2/blob/e20f26aad60ed54f0e7952928cbb64979ef8da2b/lib/strategy.js#L135
        if (!user) {
          return ctx.redirect(`/?notice=auth-error`);
        }

        // Handle errors from Azure which come in the format: message, Trace ID,
        // Correlation ID, Timestamp in these two query string parameters.
        const { error, error_description } = ctx.request.query;

        if (error && error_description) {
          Logger.error(
            "Error from Azure during authentication",
            new Error(String(error_description))
          );
          // Display only the descriptive message to the user, log the rest
          const description = String(error_description).split("Trace ID")[0];
          return ctx.redirect(`/?notice=auth-error&description=${description}`);
        }

        if (result.user.isSuspended) {
          return ctx.redirect("/?notice=suspended");
        }

        await signIn(ctx, providerName, result);
      }
    )(ctx);
  };
}
