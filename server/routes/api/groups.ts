import Router from "koa-router";
import { Op } from "sequelize";
import { MAX_AVATAR_DISPLAY } from "@shared/constants";
import auth from "@server/middlewares/authentication";
import { User, Event, Group, GroupUser } from "@server/models";
import { authorize } from "@server/policies";
import {
  presentGroup,
  presentPolicies,
  presentUser,
  presentGroupMembership,
} from "@server/presenters";
import { APIContext } from "@server/types";
import { assertPresent, assertUuid, assertSort } from "@server/validation";
import pagination from "./middlewares/pagination";

const router = new Router();

router.post("groups.list", auth(), pagination(), async (ctx: APIContext) => {
  let { direction } = ctx.request.body;
  const { sort = "updatedAt" } = ctx.request.body;
  if (direction !== "ASC") {
    direction = "DESC";
  }

  assertSort(sort, Group);
  const { user } = ctx.state.auth;
  const groups = await Group.findAll({
    where: {
      teamId: user.teamId,
    },
    order: [[sort, direction]],
    offset: ctx.state.pagination.offset,
    limit: ctx.state.pagination.limit,
  });

  ctx.body = {
    pagination: ctx.state.pagination,
    data: {
      groups: groups.map(presentGroup),
      groupMemberships: groups
        .map((g) =>
          g.groupMemberships
            .filter((membership) => !!membership.user)
            .slice(0, MAX_AVATAR_DISPLAY)
        )
        .flat()
        .map((membership) =>
          presentGroupMembership(membership, { includeUser: true })
        ),
    },
    policies: presentPolicies(user, groups),
  };
});

router.post("groups.info", auth(), async (ctx: APIContext) => {
  const { id } = ctx.request.body;
  assertUuid(id, "id is required");

  const { user } = ctx.state.auth;
  const group = await Group.findByPk(id);
  authorize(user, "read", group);

  ctx.body = {
    data: presentGroup(group),
    policies: presentPolicies(user, [group]),
  };
});

router.post("groups.create", auth(), async (ctx: APIContext) => {
  const { name } = ctx.request.body;
  assertPresent(name, "name is required");

  const { user } = ctx.state.auth;
  authorize(user, "createGroup", user.team);
  const g = await Group.create({
    name,
    teamId: user.teamId,
    createdById: user.id,
  });

  // reload to get default scope
  const group = await Group.findByPk(g.id, { rejectOnEmpty: true });

  await Event.create({
    name: "groups.create",
    actorId: user.id,
    teamId: user.teamId,
    modelId: group.id,
    data: {
      name: group.name,
    },
    ip: ctx.request.ip,
  });

  ctx.body = {
    data: presentGroup(group),
    policies: presentPolicies(user, [group]),
  };
});

router.post("groups.update", auth(), async (ctx: APIContext) => {
  const { id, name } = ctx.request.body;
  assertPresent(name, "name is required");
  assertUuid(id, "id is required");

  const { user } = ctx.state.auth;
  const group = await Group.findByPk(id);
  authorize(user, "update", group);

  group.name = name;

  if (group.changed()) {
    await group.save();
    await Event.create({
      name: "groups.update",
      teamId: user.teamId,
      actorId: user.id,
      modelId: group.id,
      data: {
        name,
      },
      ip: ctx.request.ip,
    });
  }

  ctx.body = {
    data: presentGroup(group),
    policies: presentPolicies(user, [group]),
  };
});

router.post("groups.delete", auth(), async (ctx: APIContext) => {
  const { id } = ctx.request.body;
  assertUuid(id, "id is required");

  const { user } = ctx.state.auth;
  const group = await Group.findByPk(id);
  authorize(user, "delete", group);

  await group.destroy();
  await Event.create({
    name: "groups.delete",
    actorId: user.id,
    modelId: group.id,
    teamId: group.teamId,
    data: {
      name: group.name,
    },
    ip: ctx.request.ip,
  });

  ctx.body = {
    success: true,
  };
});

router.post(
  "groups.memberships",
  auth(),
  pagination(),
  async (ctx: APIContext) => {
    const { id, query } = ctx.request.body;
    assertUuid(id, "id is required");

    const { user } = ctx.state.auth;
    const group = await Group.findByPk(id);
    authorize(user, "read", group);
    let userWhere;

    if (query) {
      userWhere = {
        name: {
          [Op.iLike]: `%${query}%`,
        },
      };
    }

    const memberships = await GroupUser.findAll({
      where: {
        groupId: id,
      },
      order: [["createdAt", "DESC"]],
      offset: ctx.state.pagination.offset,
      limit: ctx.state.pagination.limit,
      include: [
        {
          model: User,
          as: "user",
          where: userWhere,
          required: true,
        },
      ],
    });

    ctx.body = {
      pagination: ctx.state.pagination,
      data: {
        groupMemberships: memberships.map((membership) =>
          presentGroupMembership(membership, { includeUser: true })
        ),
        users: memberships.map((membership) => presentUser(membership.user)),
      },
    };
  }
);

router.post("groups.add_user", auth(), async (ctx: APIContext) => {
  const { id, userId } = ctx.request.body;
  assertUuid(id, "id is required");
  assertUuid(userId, "userId is required");

  const actor = ctx.state.auth.user;

  const user = await User.findByPk(userId);
  authorize(actor, "read", user);

  let group = await Group.findByPk(id);
  authorize(actor, "update", group);

  let membership = await GroupUser.findOne({
    where: {
      groupId: id,
      userId,
    },
  });

  if (!membership) {
    await group.$add("user", user, {
      through: {
        createdById: actor.id,
      },
    });
    // reload to get default scope
    membership = await GroupUser.findOne({
      where: {
        groupId: id,
        userId,
      },
      rejectOnEmpty: true,
    });

    // reload to get default scope
    group = await Group.findByPk(id, { rejectOnEmpty: true });

    await Event.create({
      name: "groups.add_user",
      userId,
      teamId: user.teamId,
      modelId: group.id,
      actorId: actor.id,
      data: {
        name: user.name,
      },
      ip: ctx.request.ip,
    });
  }

  ctx.body = {
    data: {
      users: [presentUser(user)],
      groupMemberships: [
        presentGroupMembership(membership, { includeUser: true }),
      ],
      groups: [presentGroup(group)],
    },
  };
});

router.post("groups.remove_user", auth(), async (ctx: APIContext) => {
  const { id, userId } = ctx.request.body;
  assertUuid(id, "id is required");
  assertUuid(userId, "userId is required");

  const actor = ctx.state.auth.user;

  let group = await Group.findByPk(id);
  authorize(actor, "update", group);

  const user = await User.findByPk(userId);
  authorize(actor, "read", user);

  await group.$remove("user", user);
  await Event.create({
    name: "groups.remove_user",
    userId,
    modelId: group.id,
    teamId: user.teamId,
    actorId: actor.id,
    data: {
      name: user.name,
    },
    ip: ctx.request.ip,
  });

  // reload to get default scope
  group = await Group.findByPk(id, { rejectOnEmpty: true });

  ctx.body = {
    data: {
      groups: [presentGroup(group)],
    },
  };
});

export default router;
