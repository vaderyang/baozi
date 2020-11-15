// @flow
import Router from "koa-router";
import auth from "../middlewares/authentication";
import { Event, Team } from "../models";

import policy from "../policies";
import { presentTeam, presentPolicies } from "../presenters";

const { authorize } = policy;
const router = new Router();

router.post("team.update", auth(), async (ctx) => {
  const {
    name,
    avatarUrl,
    subdomain,
    sharing,
    guestSignin,
    documentEmbeds,
  } = ctx.body;
  const user = ctx.state.user;
  const team = await Team.findByPk(user.teamId);
  authorize(user, "update", team);

  if (subdomain !== undefined && process.env.SUBDOMAINS_ENABLED === "true") {
    team.subdomain = subdomain === "" ? null : subdomain;
  }

  if (name) team.name = name;
  if (sharing !== undefined) team.sharing = sharing;
  if (documentEmbeds !== undefined) team.documentEmbeds = documentEmbeds;
  if (guestSignin !== undefined) team.guestSignin = guestSignin;
  if (avatarUrl !== undefined) team.avatarUrl = avatarUrl;

  const changes = team.changed();
  const data = {};

  await team.save();

  for (const change of changes) {
    data[change] = team[change];
  }

  await Event.create({
    name: "teams.update",
    actorId: user.id,
    teamId: user.teamId,
    data,
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentTeam(team),
    policies: presentPolicies(user, [team]),
  };
});

export default router;
