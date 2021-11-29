import Router from "koa-router";
import auth from "@server/middlewares/authentication";
import { View, Document, Event } from "@server/models";
import policy from "@server/policies";
import { presentView } from "@server/presenters";
import { assertUuid } from "@server/validation";

const { authorize } = policy;
const router = new Router();

router.post("views.list", auth(), async (ctx) => {
  const { documentId } = ctx.body;
  assertUuid(documentId, "documentId is required");

  const user = ctx.state.user;
  const document = await Document.findByPk(documentId, {
    userId: user.id,
  });
  authorize(user, "read", document);
  const views = await View.findByDocument(documentId);
  ctx.body = {
    data: views.map(presentView),
  };
});

router.post("views.create", auth(), async (ctx) => {
  const { documentId } = ctx.body;
  assertUuid(documentId, "documentId is required");

  const user = ctx.state.user;
  const document = await Document.findByPk(documentId, {
    userId: user.id,
  });
  authorize(user, "read", document);
  const view = await View.increment({
    documentId,
    userId: user.id,
  });
  await Event.create({
    name: "views.create",
    actorId: user.id,
    documentId: document.id,
    collectionId: document.collectionId,
    teamId: user.teamId,
    data: {
      title: document.title,
    },
    ip: ctx.request.ip,
  });
  view.user = user;
  ctx.body = {
    data: presentView(view),
  };
});

export default router;
