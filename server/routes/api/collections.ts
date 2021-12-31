import fractionalIndex from "fractional-index";
import Router from "koa-router";
import collectionExporter from "@server/commands/collectionExporter";
import { ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import {
  Collection,
  CollectionUser,
  CollectionGroup,
  Team,
  Event,
  User,
  Group,
  Attachment,
} from "@server/models";
import policy from "@server/policies";
import {
  presentCollection,
  presentUser,
  presentPolicies,
  presentMembership,
  presentGroup,
  presentCollectionGroupMembership,
  presentFileOperation,
} from "@server/presenters";
import { Op, sequelize } from "@server/sequelize";
import collectionIndexing from "@server/utils/collectionIndexing";
import removeIndexCollision from "@server/utils/removeIndexCollision";
import {
  assertUuid,
  assertIn,
  assertPresent,
  assertHexColor,
  assertIndexCharacters,
} from "@server/validation";
import pagination from "./middlewares/pagination";

const { authorize } = policy;
const router = new Router();

router.post("collections.create", auth(), async (ctx) => {
  const {
    name,
    color,
    description,
    permission,
    sharing,
    icon,
    sort = Collection.DEFAULT_SORT,
  } = ctx.body;
  let { index } = ctx.body;
  assertPresent(name, "name is required");

  if (color) {
    assertHexColor(color, "Invalid hex value (please use format #FFFFFF)");
  }

  const user = ctx.state.user;
  authorize(user, "createCollection", user.team);

  if (index) {
    assertIndexCharacters(index);
  } else {
    const collections = await Collection.findAll({
      where: {
        teamId: user.teamId,
        deletedAt: null,
      },
      attributes: ["id", "index", "updatedAt"],
      limit: 1,
      order: [
        // using LC_COLLATE:"C" because we need byte order to drive the sorting
        sequelize.literal('"collection"."index" collate "C"'),
        ["updatedAt", "DESC"],
      ],
    });

    index = fractionalIndex(
      null,
      collections.length ? collections[0].index : null
    );
  }

  index = await removeIndexCollision(user.teamId, index);
  let collection = await Collection.create({
    name,
    description,
    icon,
    color,
    teamId: user.teamId,
    createdById: user.id,
    permission: permission ? permission : null,
    sharing,
    sort,
    index,
  });
  await Event.create({
    name: "collections.create",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: user.id,
    data: {
      name,
    },
    ip: ctx.request.ip,
  });
  // we must reload the collection to get memberships for policy presenter
  collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(collection.id);
  ctx.body = {
    data: presentCollection(collection),
    policies: presentPolicies(user, [collection]),
  };
});

router.post("collections.info", auth(), async (ctx) => {
  const { id } = ctx.body;
  assertPresent(id, "id is required");
  const user = ctx.state.user;
  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  authorize(user, "read", collection);
  ctx.body = {
    data: presentCollection(collection),
    policies: presentPolicies(user, [collection]),
  };
});

router.post("collections.import", auth(), async (ctx) => {
  const { type, attachmentId } = ctx.body;
  assertIn(type, ["outline"], "type must be one of 'outline'");
  assertUuid(attachmentId, "attachmentId is required");
  const user = ctx.state.user;
  authorize(user, "importCollection", user.team);
  const attachment = await Attachment.findByPk(attachmentId);
  authorize(user, "read", attachment);
  await Event.create({
    name: "collections.import",
    modelId: attachmentId,
    teamId: user.teamId,
    actorId: user.id,
    data: {
      type,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
  };
});

router.post("collections.add_group", auth(), async (ctx) => {
  const { id, groupId, permission = "read_write" } = ctx.body;
  assertUuid(id, "id is required");
  assertUuid(groupId, "groupId is required");
  const collection = await Collection.scope({
    method: ["withMembership", ctx.state.user.id],
  }).findByPk(id);
  authorize(ctx.state.user, "update", collection);
  const group = await Group.findByPk(groupId);
  authorize(ctx.state.user, "read", group);
  let membership = await CollectionGroup.findOne({
    where: {
      collectionId: id,
      groupId,
    },
  });

  if (!membership) {
    membership = await CollectionGroup.create({
      collectionId: id,
      groupId,
      permission,
      createdById: ctx.state.user.id,
    });
  } else if (permission) {
    membership.permission = permission;
    await membership.save();
  }

  await Event.create({
    name: "collections.add_group",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: ctx.state.user.id,
    data: {
      name: group.name,
      groupId,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    data: {
      collectionGroupMemberships: [
        presentCollectionGroupMembership(membership),
      ],
    },
  };
});

router.post("collections.remove_group", auth(), async (ctx) => {
  const { id, groupId } = ctx.body;
  assertUuid(id, "id is required");
  assertUuid(groupId, "groupId is required");
  const collection = await Collection.scope({
    method: ["withMembership", ctx.state.user.id],
  }).findByPk(id);
  authorize(ctx.state.user, "update", collection);
  const group = await Group.findByPk(groupId);
  authorize(ctx.state.user, "read", group);
  await collection.removeGroup(group);
  await Event.create({
    name: "collections.remove_group",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: ctx.state.user.id,
    data: {
      name: group.name,
      groupId,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
  };
});

router.post(
  "collections.group_memberships",
  auth(),
  pagination(),
  async (ctx) => {
    const { id, query, permission } = ctx.body;
    assertUuid(id, "id is required");
    const user = ctx.state.user;
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);
    authorize(user, "read", collection);
    let where = {
      collectionId: id,
    };
    let groupWhere;

    if (query) {
      groupWhere = {
        name: {
          [Op.iLike]: `%${query}%`,
        },
      };
    }

    if (permission) {
      // @ts-expect-error ts-migrate(2322) FIXME: Type '{ permission: any; collectionId: any; }' is ... Remove this comment to see the full error message
      where = { ...where, permission };
    }

    const memberships = await CollectionGroup.findAll({
      where,
      order: [["createdAt", "DESC"]],
      offset: ctx.state.pagination.offset,
      limit: ctx.state.pagination.limit,
      include: [
        {
          model: Group,
          as: "group",
          where: groupWhere,
          required: true,
        },
      ],
    });
    ctx.body = {
      pagination: ctx.state.pagination,
      data: {
        collectionGroupMemberships: memberships.map(
          presentCollectionGroupMembership
        ),
        // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'membership' implicitly has an 'any' typ... Remove this comment to see the full error message
        groups: memberships.map((membership) => presentGroup(membership.group)),
      },
    };
  }
);

router.post("collections.add_user", auth(), async (ctx) => {
  const { id, userId, permission = "read_write" } = ctx.body;
  assertUuid(id, "id is required");
  assertUuid(userId, "userId is required");
  const collection = await Collection.scope({
    method: ["withMembership", ctx.state.user.id],
  }).findByPk(id);
  authorize(ctx.state.user, "update", collection);
  const user = await User.findByPk(userId);
  authorize(ctx.state.user, "read", user);
  let membership = await CollectionUser.findOne({
    where: {
      collectionId: id,
      userId,
    },
  });

  if (!membership) {
    membership = await CollectionUser.create({
      collectionId: id,
      userId,
      permission,
      createdById: ctx.state.user.id,
    });
  } else if (permission) {
    membership.permission = permission;
    await membership.save();
  }

  await Event.create({
    name: "collections.add_user",
    userId,
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: ctx.state.user.id,
    data: {
      name: user.name,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    data: {
      users: [presentUser(user)],
      memberships: [presentMembership(membership)],
    },
  };
});

router.post("collections.remove_user", auth(), async (ctx) => {
  const { id, userId } = ctx.body;
  assertUuid(id, "id is required");
  assertUuid(userId, "userId is required");
  const collection = await Collection.scope({
    method: ["withMembership", ctx.state.user.id],
  }).findByPk(id);
  authorize(ctx.state.user, "update", collection);
  const user = await User.findByPk(userId);
  authorize(ctx.state.user, "read", user);
  await collection.removeUser(user);
  await Event.create({
    name: "collections.remove_user",
    userId,
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: ctx.state.user.id,
    data: {
      name: user.name,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
  };
});
// DEPRECATED: Use collection.memberships which has pagination, filtering and permissions
router.post("collections.users", auth(), async (ctx) => {
  const { id } = ctx.body;
  assertUuid(id, "id is required");
  const user = ctx.state.user;
  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  authorize(user, "read", collection);
  const users = await collection.getUsers();
  ctx.body = {
    data: users.map(presentUser),
  };
});

router.post("collections.memberships", auth(), pagination(), async (ctx) => {
  const { id, query, permission } = ctx.body;
  assertUuid(id, "id is required");
  const user = ctx.state.user;
  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  authorize(user, "read", collection);
  let where = {
    collectionId: id,
  };
  let userWhere;

  if (query) {
    userWhere = {
      name: {
        [Op.iLike]: `%${query}%`,
      },
    };
  }

  if (permission) {
    // @ts-expect-error ts-migrate(2322) FIXME: Type '{ permission: any; collectionId: any; }' is ... Remove this comment to see the full error message
    where = { ...where, permission };
  }

  const memberships = await CollectionUser.findAll({
    where,
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
      memberships: memberships.map(presentMembership),
      // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'membership' implicitly has an 'any' typ... Remove this comment to see the full error message
      users: memberships.map((membership) => presentUser(membership.user)),
    },
  };
});

router.post("collections.export", auth(), async (ctx) => {
  const { id } = ctx.body;
  assertUuid(id, "id is required");
  const user = ctx.state.user;
  const team = await Team.findByPk(user.teamId);
  authorize(user, "export", team);
  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  assertPresent(collection, "Collection should be present");
  authorize(user, "read", collection);
  const fileOperation = await collectionExporter({
    collection,
    user,
    team,
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
    data: {
      fileOperation: presentFileOperation(fileOperation),
    },
  };
});

router.post("collections.export_all", auth(), async (ctx) => {
  const user = ctx.state.user;
  const team = await Team.findByPk(user.teamId);
  authorize(user, "export", team);
  const fileOperation = await collectionExporter({
    user,
    team,
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
    data: {
      fileOperation: presentFileOperation(fileOperation),
    },
  };
});

router.post("collections.update", auth(), async (ctx) => {
  const {
    id,
    name,
    description,
    icon,
    permission,
    color,
    sort,
    sharing,
  } = ctx.body;

  if (color) {
    assertHexColor(color, "Invalid hex value (please use format #FFFFFF)");
  }

  const user = ctx.state.user;
  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  authorize(user, "update", collection);

  // we're making this collection have no default access, ensure that the current
  // user has a read-write membership so that at least they can edit it
  if (permission !== "read_write" && collection.permission === "read_write") {
    await CollectionUser.findOrCreate({
      where: {
        collectionId: collection.id,
        userId: user.id,
      },
      defaults: {
        permission: "read_write",
        createdById: user.id,
      },
    });
  }

  let privacyChanged = false;
  let sharingChanged = false;

  if (name !== undefined) {
    collection.name = name;
  }

  if (description !== undefined) {
    collection.description = description;
  }

  if (icon !== undefined) {
    collection.icon = icon;
  }

  if (color !== undefined) {
    collection.color = color;
  }

  if (permission !== undefined) {
    // frontend sends empty string
    assertIn(
      permission,
      ["read_write", "read", "", null],
      "Invalid permission"
    );
    privacyChanged = permission !== collection.permission;
    collection.permission = permission ? permission : null;
  }

  if (sharing !== undefined) {
    sharingChanged = sharing !== collection.sharing;
    collection.sharing = sharing;
  }

  if (sort !== undefined) {
    collection.sort = sort;
  }

  await collection.save();
  await Event.create({
    name: "collections.update",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: user.id,
    data: {
      name,
    },
    ip: ctx.request.ip,
  });

  if (privacyChanged || sharingChanged) {
    await Event.create({
      name: "collections.permission_changed",
      collectionId: collection.id,
      teamId: collection.teamId,
      actorId: user.id,
      data: {
        privacyChanged,
        sharingChanged,
      },
      ip: ctx.request.ip,
    });
  }

  // must reload to update collection membership for correct policy calculation
  // if the privacy level has changed. Otherwise skip this query for speed.
  if (privacyChanged || sharingChanged) {
    await collection.reload();
  }

  ctx.body = {
    data: presentCollection(collection),
    policies: presentPolicies(user, [collection]),
  };
});

router.post("collections.list", auth(), pagination(), async (ctx) => {
  const user = ctx.state.user;
  const collectionIds = await user.collectionIds();
  const collections = await Collection.scope({
    method: ["withMembership", user.id],
  }).findAll({
    where: {
      teamId: user.teamId,
      id: collectionIds,
    },
    order: [["updatedAt", "DESC"]],
    offset: ctx.state.pagination.offset,
    limit: ctx.state.pagination.limit,
  });
  const nullIndexCollection = collections.findIndex(
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'collection' implicitly has an 'any' typ... Remove this comment to see the full error message
    (collection) => collection.index === null
  );

  if (nullIndexCollection !== -1) {
    const indexedCollections = await collectionIndexing(ctx.state.user.teamId);
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'collection' implicitly has an 'any' typ... Remove this comment to see the full error message
    collections.forEach((collection) => {
      collection.index = indexedCollections[collection.id];
    });
  }

  ctx.body = {
    pagination: ctx.state.pagination,
    data: collections.map(presentCollection),
    policies: presentPolicies(user, collections),
  };
});

router.post("collections.delete", auth(), async (ctx) => {
  const { id } = ctx.body;
  const user = ctx.state.user;
  assertUuid(id, "id is required");

  const collection = await Collection.scope({
    method: ["withMembership", user.id],
  }).findByPk(id);
  authorize(user, "delete", collection);

  const total = await Collection.count();
  if (total === 1) throw ValidationError("Cannot delete last collection");

  await collection.destroy();
  await Event.create({
    name: "collections.delete",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: user.id,
    data: {
      name: collection.name,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
  };
});

router.post("collections.move", auth(), async (ctx) => {
  const id = ctx.body.id;
  let index = ctx.body.index;
  assertPresent(index, "index is required");
  assertIndexCharacters(index);
  assertUuid(id, "id must be a uuid");
  const user = ctx.state.user;
  const collection = await Collection.findByPk(id);
  authorize(user, "move", collection);
  index = await removeIndexCollision(user.teamId, index);
  await collection.update({
    index,
  });
  await Event.create({
    name: "collections.move",
    collectionId: collection.id,
    teamId: collection.teamId,
    actorId: user.id,
    data: {
      index,
    },
    ip: ctx.request.ip,
  });
  ctx.body = {
    success: true,
    data: {
      index,
    },
  };
});

export default router;
