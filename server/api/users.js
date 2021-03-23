// @flow
import Router from "koa-router";
import userInviter from "../commands/userInviter";
import userSuspender from "../commands/userSuspender";
import auth from "../middlewares/authentication";
import { Event, User, Team } from "../models";
import policy from "../policies";
import { presentUser, presentPolicies } from "../presenters";
import { Op } from "../sequelize";
import pagination from "./middlewares/pagination";

const { authorize } = policy;
const router = new Router();

router.post("users.list", auth(), pagination(), async (ctx) => {
  const { sort = "createdAt", query, includeSuspended = false } = ctx.body;
  let direction = ctx.body.direction;
  if (direction !== "ASC") direction = "DESC";
  const user = ctx.state.user;

  let where = {
    teamId: user.teamId,
  };

  if (!includeSuspended) {
    where = {
      ...where,
      suspendedAt: {
        [Op.eq]: null,
      },
    };
  }

  if (query) {
    where = {
      ...where,
      name: {
        [Op.iLike]: `%${query}%`,
      },
    };
  }

  const users = await User.findAll({
    where,
    order: [[sort, direction]],
    offset: ctx.state.pagination.offset,
    limit: ctx.state.pagination.limit,
  });

  ctx.body = {
    pagination: ctx.state.pagination,
    data: users.map((listUser) =>
      presentUser(listUser, { includeDetails: user.isAdmin })
    ),
    policies: presentPolicies(user, users),
  };
});

router.post("users.count", auth(), async (ctx) => {
  const { user } = ctx.state;
  const counts = await User.getCounts(user.teamId);

  ctx.body = {
    data: {
      counts,
    },
  };
});

router.post("users.info", auth(), async (ctx) => {
  const { user } = ctx.state;

  ctx.body = {
    data: presentUser(user),
    policies: presentPolicies(user, [user]),
  };
});

router.post("users.update", auth(), async (ctx) => {
  const { user } = ctx.state;
  const { name, avatarUrl, language } = ctx.body;

  if (name) user.name = name;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  if (language) user.language = language;

  await user.save();

  await Event.create({
    name: "users.update",
    actorId: user.id,
    userId: user.id,
    teamId: user.teamId,
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentUser(user, { includeDetails: true }),
  };
});

// Admin specific

router.post("users.promote", auth(), async (ctx) => {
  const userId = ctx.body.id;
  const teamId = ctx.state.user.teamId;
  const actor = ctx.state.user;
  ctx.assertPresent(userId, "id is required");

  const user = await User.findByPk(userId);
  authorize(actor, "promote", user);

  const team = await Team.findByPk(teamId);
  await team.addAdmin(user);

  await Event.create({
    name: "users.promote",
    actorId: actor.id,
    userId,
    teamId,
    data: { name: user.name },
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentUser(user, { includeDetails: true }),
    policies: presentPolicies(actor, [user]),
  };
});

router.post("users.demote", auth(), async (ctx) => {
  const userId = ctx.body.id;
  const teamId = ctx.state.user.teamId;
  const actor = ctx.state.user;
  ctx.assertPresent(userId, "id is required");

  const user = await User.findByPk(userId);
  authorize(actor, "demote", user);

  const team = await Team.findByPk(teamId);
  await team.removeAdmin(user);

  await Event.create({
    name: "users.demote",
    actorId: actor.id,
    userId,
    teamId,
    data: { name: user.name },
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentUser(user, { includeDetails: true }),
    policies: presentPolicies(actor, [user]),
  };
});

router.post("users.suspend", auth(), async (ctx) => {
  const userId = ctx.body.id;
  const actor = ctx.state.user;
  ctx.assertPresent(userId, "id is required");

  const user = await User.findByPk(userId);
  authorize(actor, "suspend", user);

  await userSuspender({
    user,
    actorId: actor.id,
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentUser(user, { includeDetails: true }),
    policies: presentPolicies(actor, [user]),
  };
});

router.post("users.activate", auth(), async (ctx) => {
  const userId = ctx.body.id;
  const teamId = ctx.state.user.teamId;
  const actor = ctx.state.user;
  ctx.assertPresent(userId, "id is required");

  const user = await User.findByPk(userId);
  authorize(actor, "activate", user);

  const team = await Team.findByPk(teamId);
  await team.activateUser(user, actor);

  await Event.create({
    name: "users.activate",
    actorId: actor.id,
    userId,
    teamId,
    data: { name: user.name },
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentUser(user, { includeDetails: true }),
    policies: presentPolicies(actor, [user]),
  };
});

router.post("users.invite", auth(), async (ctx) => {
  const { invites } = ctx.body;
  ctx.assertPresent(invites, "invites is required");

  const { user } = ctx.state;
  const team = await Team.findByPk(user.teamId);
  authorize(user, "invite", team);

  const response = await userInviter({ user, invites, ip: ctx.request.ip });

  ctx.body = {
    data: {
      sent: response.sent,
      users: response.users.map((user) => presentUser(user)),
    },
  };
});

router.post("users.delete", auth(), async (ctx) => {
  const { confirmation, id } = ctx.body;
  ctx.assertPresent(confirmation, "confirmation is required");

  let user = ctx.state.user;
  if (id) user = await User.findByPk(id);
  authorize(ctx.state.user, "delete", user);

  await user.destroy();
  await Event.create({
    name: "users.delete",
    actorId: user.id,
    userId: user.id,
    teamId: user.teamId,
    data: { name: user.name },
    ip: ctx.request.ip,
  });

  ctx.body = {
    success: true,
  };
});

export default router;
