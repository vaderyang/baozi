// @flow
import * as Sentry from "@sentry/node";
import addHours from "date-fns/add_hours";
import invariant from "invariant";
import Router from "koa-router";
import Sequelize from "sequelize";
import { slackAuth } from "../../shared/utils/routeHelpers";
import teamCreator from "../commands/teamCreator";
import userCreator from "../commands/userCreator";
import auth from "../middlewares/authentication";
import { Authentication, Collection, Integration, User, Team } from "../models";
import * as Slack from "../slack";
import { getCookieDomain } from "../utils/domains";

const router = new Router();

// start the oauth process and redirect user to Slack
router.get("slack", async (ctx) => {
  const state = Math.random().toString(36).substring(7);

  ctx.cookies.set("state", state, {
    httpOnly: false,
    expires: addHours(new Date(), 1),
    domain: getCookieDomain(ctx.request.hostname),
  });
  ctx.redirect(slackAuth(state));
});

// signin callback from Slack
router.get("slack.callback", auth({ required: false }), async (ctx) => {
  const { code, error, state } = ctx.request.query;
  ctx.assertPresent(code || error, "code is required");
  ctx.assertPresent(state, "state is required");

  if (state !== ctx.cookies.get("state")) {
    ctx.redirect("/?notice=auth-error&error=state_mismatch");
    return;
  }
  if (error) {
    ctx.redirect(`/?notice=auth-error&error=${error}`);
    return;
  }

  const data = await Slack.oauthAccess(code);

  let result;
  try {
    result = await teamCreator({
      name: data.team.name,
      subdomain: data.team.domain,
      avatarUrl: data.team.image_230,
      authenticationProvider: {
        name: "slack",
        providerId: data.team.id,
      },
    });
  } catch (err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
      ctx.redirect(`/?notice=auth-error&error=team-exists`);
      return;
    }
    throw err;
  }

  invariant(result, "Team creator result must exist");
  const { authenticationProvider, team, isNewTeam } = result;

  try {
    const result = await userCreator({
      name: data.user.name,
      email: data.user.email,
      isAdmin: isNewTeam,
      avatarUrl: data.user.image_192,
      teamId: team.id,
      ip: ctx.request.ip,
      authentication: {
        authenticationProviderId: authenticationProvider.id,
        providerId: data.user.id,
        accessToken: data.access_token,
        scopes: data.scope.split(","),
      },
    });

    const { user, isNewUser } = result;

    if (isNewTeam) {
      await team.provisionFirstCollection(user.id);
    }

    // set cookies on response and redirect to team subdomain
    ctx.signIn(user, team, "slack", isNewUser);
  } catch (err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
      const exists = await User.findOne({
        where: {
          email: data.user.email,
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

router.get("slack.commands", auth({ required: false }), async (ctx) => {
  const { code, state, error } = ctx.request.query;
  const user = ctx.state.user;
  ctx.assertPresent(code || error, "code is required");

  if (error) {
    ctx.redirect(`/settings/integrations/slack?error=${error}`);
    return;
  }

  // this code block accounts for the root domain being unable to
  // access authentication for subdomains. We must forward to the appropriate
  // subdomain to complete the oauth flow
  if (!user) {
    if (state) {
      try {
        const team = await Team.findByPk(state);
        return ctx.redirect(
          `${team.url}/auth${ctx.request.path}?${ctx.request.querystring}`
        );
      } catch (err) {
        return ctx.redirect(
          `/settings/integrations/slack?error=unauthenticated`
        );
      }
    } else {
      return ctx.redirect(`/settings/integrations/slack?error=unauthenticated`);
    }
  }

  const endpoint = `${process.env.URL || ""}/auth/slack.commands`;
  const data = await Slack.oauthAccess(code, endpoint);

  const authentication = await Authentication.create({
    service: "slack",
    userId: user.id,
    teamId: user.teamId,
    token: data.access_token,
    scopes: data.scope.split(","),
  });

  await Integration.create({
    service: "slack",
    type: "command",
    userId: user.id,
    teamId: user.teamId,
    authenticationId: authentication.id,
    settings: {
      serviceTeamId: data.team_id,
    },
  });

  ctx.redirect("/settings/integrations/slack");
});

router.get("slack.post", auth({ required: false }), async (ctx) => {
  const { code, error, state } = ctx.request.query;
  const user = ctx.state.user;
  ctx.assertPresent(code || error, "code is required");

  const collectionId = state;
  ctx.assertUuid(collectionId, "collectionId must be an uuid");

  if (error) {
    ctx.redirect(`/settings/integrations/slack?error=${error}`);
    return;
  }

  // this code block accounts for the root domain being unable to
  // access authentcation for subdomains. We must forward to the
  // appropriate subdomain to complete the oauth flow
  if (!user) {
    try {
      const collection = await Collection.findByPk(state);
      const team = await Team.findByPk(collection.teamId);
      return ctx.redirect(
        `${team.url}/auth${ctx.request.path}?${ctx.request.querystring}`
      );
    } catch (err) {
      return ctx.redirect(`/settings/integrations/slack?error=unauthenticated`);
    }
  }

  const endpoint = `${process.env.URL || ""}/auth/slack.post`;
  const data = await Slack.oauthAccess(code, endpoint);

  const authentication = await Authentication.create({
    service: "slack",
    userId: user.id,
    teamId: user.teamId,
    token: data.access_token,
    scopes: data.scope.split(","),
  });

  await Integration.create({
    service: "slack",
    type: "post",
    userId: user.id,
    teamId: user.teamId,
    authenticationId: authentication.id,
    collectionId,
    events: [],
    settings: {
      url: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
      channelId: data.incoming_webhook.channel_id,
    },
  });

  ctx.redirect("/settings/integrations/slack");
});

export default router;
