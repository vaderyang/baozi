// @flow
import invariant from "invariant";
import { concat, some } from "lodash";
import { AdminRequiredError } from "../errors";
import { Collection, User } from "../models";
import policy from "./policy";

const { allow } = policy;

allow(User, "create", Collection);

allow(User, ["read", "export"], Collection, (user, collection) => {
  if (!collection || user.teamId !== collection.teamId) return false;

  if (collection.private) {
    invariant(
      collection.memberships,
      "membership should be preloaded, did you forget withMembership scope?"
    );

    const allMemberships = concat(
      collection.memberships,
      collection.collectionGroupMemberships
    );

    return some(allMemberships, (m) =>
      ["read", "read_write", "maintainer"].includes(m.permission)
    );
  }

  return true;
});

allow(User, ["publish", "update"], Collection, (user, collection) => {
  if (!collection || user.teamId !== collection.teamId) return false;

  if (collection.private) {
    invariant(
      collection.memberships,
      "membership should be preloaded, did you forget withMembership scope?"
    );

    const allMemberships = concat(
      collection.memberships,
      collection.collectionGroupMemberships
    );

    return some(allMemberships, (m) =>
      ["read_write", "maintainer"].includes(m.permission)
    );
  }

  return true;
});

allow(User, "delete", Collection, (user, collection) => {
  if (!collection || user.teamId !== collection.teamId) return false;

  if (collection.private) {
    invariant(
      collection.memberships,
      "membership should be preloaded, did you forget withMembership scope?"
    );
    const allMemberships = concat(
      collection.memberships,
      collection.collectionGroupMemberships
    );

    return some(allMemberships, (m) =>
      ["read_write", "maintainer"].includes(m.permission)
    );
  }

  if (user.isAdmin) return true;
  if (user.id === collection.createdById) return true;

  throw new AdminRequiredError();
});
