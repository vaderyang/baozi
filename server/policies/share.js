// @flow
import { AdminRequiredError } from "../errors";
import { Share, User } from "../models";
import policy from "./policy";

const { allow } = policy;

allow(
  User,
  ["read", "update"],
  Share,
  (user, share) => user.teamId === share.teamId
);

allow(User, "revoke", Share, (user, share) => {
  if (!share || user.teamId !== share.teamId) return false;
  if (user.id === share.userId) return true;
  if (user.isAdmin) return true;
  throw new AdminRequiredError();
});
