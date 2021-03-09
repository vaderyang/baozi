// @flow
import * as Sentry from "@sentry/node";
import { OAuth2Client } from "google-auth-library";
import invariant from "invariant";
import Router from "koa-router";
import { capitalize } from "lodash";
import Sequelize from "sequelize";
import teamCreator from "../commands/teamCreator";
import userCreator from "../commands/userCreator";
import auth from "../middlewares/authentication";
import { User } from "../models";

const router = new Router();
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.URL}/auth/google.callback`
);
const allowedDomainsEnv = process.env.GOOGLE_ALLOWED_DOMAINS;

// start the oauth process and redirect user to Google
router.get("google", async (ctx) => {
  // Generate the url that will be used for the consent dialog.
  const authorizeUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "select_account consent",
  });
  ctx.redirect(authorizeUrl);
});

// signin callback from Google
router.get("google.callback", auth({ required: false }), async (ctx) => {
  const { code } = ctx.request.query;
  ctx.assertPresent(code, "code is required");
  const response = await client.getToken(code);
  client.setCredentials(response.tokens);

  const profile = await client.request({
    url: "https://www.googleapis.com/oauth2/v1/userinfo",
  });

  if (!profile.data.hd) {
    ctx.redirect("/?notice=google-hd");
    return;
  }

  // allow all domains by default if the env is not set
  const allowedDomains = allowedDomainsEnv && allowedDomainsEnv.split(",");
  if (allowedDomains && !allowedDomains.includes(profile.data.hd)) {
    ctx.redirect("/?notice=hd-not-allowed");
    return;
  }

  const domain = profile.data.hd;
  const subdomain = profile.data.hd.split(".")[0];
  const teamName = capitalize(subdomain);

  let result;
  try {
    result = await teamCreator({
      name: teamName,
      domain,
      subdomain,
      authenticationProvider: {
        name: "google",
        providerId: domain,
      },
    });
  } catch (err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
      ctx.redirect(`/?notice=auth-error&error=team-exists`);
      return;
    }
  }

  invariant(result, "Team creator result must exist");
  const { team, isNewTeam, authenticationProvider } = result;

  try {
    const result = await userCreator({
      name: profile.data.name,
      email: profile.data.email,
      isAdmin: isNewTeam,
      avatarUrl: profile.data.picture,
      teamId: team.id,
      ip: ctx.request.ip,
      authentication: {
        authenticationProviderId: authenticationProvider.id,
        providerId: profile.data.id,
        accessToken: response.tokens.access_token,
        refreshToken: response.tokens.refresh_token,
        scopes: response.tokens.scope.split(" "),
      },
    });

    const { user, isNewUser } = result;

    if (isNewTeam) {
      await team.provisionFirstCollection(user.id);
    }

    // set cookies on response and redirect to team subdomain
    ctx.signIn(user, team, "google", isNewUser);
  } catch (err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
      const exists = await User.findOne({
        where: {
          email: profile.data.email,
          teamId: team.id,
        },
      });

      if (exists) {
        ctx.redirect(`${team.url}?notice=email-auth-required`);
      } else {
        if (process.env.SENTRY_DSN) {
          Sentry.captureException(err);
        } else {
          console.error(err);
        }
        ctx.redirect(`${team.url}?notice=auth-error`);
      }

      return;
    }

    throw err;
  }
});

export default router;
