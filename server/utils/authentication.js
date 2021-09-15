// @flow
import querystring from "querystring";
import { addMonths } from "date-fns";
import { type Context } from "koa";
import { pick } from "lodash";
import Logger from "../logging/logger";
import { User, Event, Team, Collection, View } from "../models";
import { getCookieDomain } from "../utils/domains";

export function getAllowedDomains(): string[] {
  // GOOGLE_ALLOWED_DOMAINS included here for backwards compatability
  const env = process.env.ALLOWED_DOMAINS || process.env.GOOGLE_ALLOWED_DOMAINS;
  return env ? env.split(",") : [];
}

export async function signIn(
  ctx: Context,
  user: User,
  team: Team,
  service: string,
  isNewUser: boolean = false,
  isNewTeam: boolean = false
) {
  if (user.isSuspended) {
    return ctx.redirect("/?notice=suspended");
  }

  if (isNewTeam) {
    // see: scenes/Login/index.js for where this cookie is written when
    // viewing the /login or /create pages. It is a URI encoded JSON string.
    const cookie = ctx.cookies.get("signupQueryParams");

    if (cookie) {
      try {
        const signupQueryParams = pick(
          JSON.parse(querystring.unescape(cookie)),
          ["ref", "utm_content", "utm_medium", "utm_source", "utm_campaign"]
        );
        await team.update({ signupQueryParams });
      } catch (error) {
        Logger.error(`Error persisting signup query params`, error);
      }
    }
  }

  // update the database when the user last signed in
  user.updateSignedIn(ctx.request.ip);

  // don't await event creation for a faster sign-in
  Event.create({
    name: "users.signin",
    actorId: user.id,
    userId: user.id,
    teamId: team.id,
    data: {
      name: user.name,
      service,
    },
    ip: ctx.request.ip,
  });

  const domain = getCookieDomain(ctx.request.hostname);
  const expires = addMonths(new Date(), 3);

  // set a cookie for which service we last signed in with. This is
  // only used to display a UI hint for the user for next time
  ctx.cookies.set("lastSignedIn", service, {
    httpOnly: false,
    expires: new Date("2100"),
    domain,
  });

  // set a transfer cookie for the access token itself and redirect
  // to the teams subdomain if subdomains are enabled
  if (process.env.SUBDOMAINS_ENABLED === "true" && team.subdomain) {
    // get any existing sessions (teams signed in) and add this team
    const existing = JSON.parse(
      decodeURIComponent(ctx.cookies.get("sessions") || "") || "{}"
    );
    const sessions = encodeURIComponent(
      JSON.stringify({
        ...existing,
        [team.id]: {
          name: team.name,
          logoUrl: team.logoUrl,
          url: team.url,
        },
      })
    );
    ctx.cookies.set("sessions", sessions, {
      httpOnly: false,
      expires,
      domain,
    });

    ctx.redirect(`${team.url}/auth/redirect?token=${user.getTransferToken()}`);
  } else {
    ctx.cookies.set("accessToken", user.getJwtToken(), {
      httpOnly: false,
      expires,
    });

    const [collection, view] = await Promise.all([
      Collection.findFirstCollectionForUser(user),
      View.findOne({
        where: { userId: user.id },
      }),
    ]);

    const hasViewedDocuments = !!view;
    ctx.redirect(
      !hasViewedDocuments && collection
        ? `${team.url}${collection.url}`
        : `${team.url}/home`
    );
  }
}
