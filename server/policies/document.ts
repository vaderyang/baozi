import invariant from "invariant";
import some from "lodash/some";
import {
  CollectionPermission,
  DocumentPermission,
  TeamPreference,
} from "@shared/types";
import { Document, Revision, User, Team } from "@server/models";
import { allow, _cannot as cannot, _can as can } from "./cancan";
import { and, isTeamAdmin, isTeamModel, isTeamMutable, or } from "./utils";

allow(User, "createDocument", Team, (actor, document) =>
  and(
    //
    !actor.isGuest,
    !actor.isViewer,
    isTeamModel(actor, document),
    isTeamMutable(actor)
  )
);

allow(User, "read", Document, (actor, document) =>
  and(
    isTeamModel(actor, document),
    or(
      includesMembership(document, [
        DocumentPermission.Read,
        DocumentPermission.ReadWrite,
      ]),
      and(!!document?.isDraft, actor.id === document?.createdById),
      can(actor, "readDocument", document?.collection)
    )
  )
);

allow(User, ["listRevisions", "listViews"], Document, (actor, document) =>
  and(
    //
    can(actor, "read", document),
    !actor.isGuest
  )
);

allow(User, "download", Document, (actor, document) =>
  and(
    can(actor, "read", document),
    or(
      and(!actor.isGuest, !actor.isViewer),
      !!actor.team.getPreference(TeamPreference.ViewersCanExport)
    )
  )
);

allow(User, "comment", Document, (actor, document) =>
  and(
    // TODO: We'll introduce a separate permission for commenting
    or(
      and(can(actor, "read", document), !actor.isGuest),
      and(can(actor, "update", document), actor.isGuest)
    ),
    isTeamMutable(actor),
    !!document?.isActive,
    !document?.template
  )
);

allow(
  User,
  ["star", "unstar", "subscribe", "unsubscribe"],
  Document,
  (actor, document) =>
    and(
      //
      can(actor, "read", document),
      !document?.template
    )
);

allow(User, "share", Document, (actor, document) =>
  and(
    can(actor, "read", document),
    isTeamMutable(actor),
    !!document?.isActive,
    !document?.template,
    !actor.isGuest,
    or(!document?.collection, can(actor, "share", document?.collection))
  )
);

allow(User, "update", Document, (actor, document) =>
  and(
    can(actor, "read", document),
    isTeamMutable(actor),
    !!document?.isActive,
    or(
      includesMembership(document, [DocumentPermission.ReadWrite]),
      or(
        can(actor, "updateDocument", document?.collection),
        and(!!document?.isDraft && actor.id === document?.createdById)
      )
    )
  )
);

allow(User, "publish", Document, (actor, document) =>
  and(
    //
    can(actor, "update", document),
    !!document?.isDraft
  )
);

allow(User, ["move", "duplicate", "manageUsers"], Document, (actor, document) =>
  and(
    !actor.isGuest,
    can(actor, "update", document),
    or(
      can(actor, "updateDocument", document?.collection),
      and(!!document?.isDraft && actor.id === document?.createdById)
    )
  )
);

allow(User, "createChildDocument", Document, (actor, document) =>
  and(
    can(actor, "update", document),
    !document?.isDraft,
    !document?.template,
    !actor.isGuest
  )
);

allow(User, ["pin", "unpin"], Document, (actor, document) =>
  and(
    can(actor, "update", document),
    can(actor, "update", document?.collection),
    !document?.isDraft,
    !document?.template,
    !actor.isGuest
  )
);

allow(User, "pinToHome", Document, (actor, document) =>
  and(
    //
    isTeamAdmin(actor, document),
    isTeamMutable(actor)
  )
);

allow(User, "delete", Document, (actor, document) =>
  and(
    isTeamModel(actor, document),
    isTeamMutable(actor),
    !actor.isGuest,
    !document?.isDeleted,
    or(can(actor, "update", document), !document?.collection)
  )
);

allow(User, ["restore", "permanentDelete"], Document, (actor, document) =>
  and(
    isTeamModel(actor, document),
    !actor.isGuest,
    !!document?.isDeleted,
    or(
      includesMembership(document, [DocumentPermission.ReadWrite]),
      or(
        can(actor, "updateDocument", document?.collection),
        and(!!document?.isDraft && actor.id === document?.createdById)
      ),
      !document?.collection
    )
  )
);

allow(User, "archive", Document, (actor, document) =>
  and(
    !actor.isGuest,
    !document?.template,
    !document?.isDraft,
    !!document?.isActive,
    can(actor, "update", document),
    can(actor, "updateDocument", document?.collection)
  )
);

allow(User, "unarchive", Document, (actor, document) =>
  and(
    !actor.isGuest,
    !document?.template,
    !document?.isDraft,
    !document?.isDeleted,
    !!document?.archivedAt,
    and(
      can(actor, "read", document),
      or(
        includesMembership(document, [DocumentPermission.ReadWrite]),
        or(
          can(actor, "updateDocument", document?.collection),
          and(!!document?.isDraft && actor.id === document?.createdById)
        )
      )
    ),
    can(actor, "updateDocument", document?.collection)
  )
);

allow(
  Document,
  "restore",
  Revision,
  (document, revision) => document.id === revision?.documentId
);

allow(User, "unpublish", Document, (user, document) => {
  if (
    !document ||
    user.isGuest ||
    user.isViewer ||
    !document.isActive ||
    document.isDraft
  ) {
    return false;
  }
  invariant(
    document.collection,
    "collection is missing, did you forget to include in the query scope?"
  );
  if (cannot(user, "updateDocument", document.collection)) {
    return false;
  }
  return user.teamId === document.teamId;
});

function includesMembership(
  document: Document | null,
  permissions: (DocumentPermission | CollectionPermission)[]
) {
  if (!document) {
    return false;
  }

  invariant(
    document.memberships,
    "document memberships should be preloaded, did you forget withMembership scope?"
  );
  return some(document.memberships, (m) => permissions.includes(m.permission));
}
