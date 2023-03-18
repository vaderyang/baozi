import { NotificationEventType } from "@shared/types";
import DocumentNotificationEmail from "@server/emails/templates/DocumentNotificationEmail";
import {
  View,
  Subscription,
  Event,
  Notification,
  Revision,
} from "@server/models";
import {
  buildDocument,
  buildCollection,
  buildUser,
} from "@server/test/factories";
import { setupTestDatabase } from "@server/test/support";
import NotificationsProcessor from "./NotificationsProcessor";

const ip = "127.0.0.1";

setupTestDatabase();

beforeEach(async () => {
  jest.resetAllMocks();
});

describe("documents.publish", () => {
  test("should not send a notification to author", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );

    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    user.setNotificationEventType(NotificationEventType.PublishDocument);
    await user.save();

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  test("should send a notification to other users in team", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
    });
    user.setNotificationEventType(NotificationEventType.PublishDocument);
    await user.save();

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(schedule).toHaveBeenCalled();
  });

  test("should send only one notification in a 12-hour window", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      createdById: user.id,
      lastModifiedById: user.id,
    });

    const recipient = await buildUser({
      teamId: user.teamId,
    });

    user.setNotificationEventType(NotificationEventType.PublishDocument);
    await user.save();

    await Notification.create({
      actorId: user.id,
      userId: recipient.id,
      documentId: document.id,
      teamId: recipient.teamId,
      event: "documents.publish",
      emailedAt: new Date(),
    });

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to users without collection access", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: null,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    user.setNotificationEventType(NotificationEventType.PublishDocument);
    await user.save();

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("revisions.create", () => {
  test("should send a notification to other collaborators", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    await Revision.createFromDocument(document);

    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(schedule).toHaveBeenCalled();
  });

  test("should not send a notification if viewed since update", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();

    await View.create({
      userId: collaborator.id,
      documentId: document.id,
    });

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to last editor", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: user.id,
      modelId: revision.id,
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  test("should send a notification for subscriptions, even to collaborator", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });

    document.collaboratorIds = [collaborator.id, subscriber.id];

    await document.save();

    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    expect(schedule).toHaveBeenCalled();
  });

  test("should create subscriptions for collaborator", async () => {
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({ userId: collaborator0.id });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    const events = await Event.findAll();

    // Should emit 3 `subscriptions.create` events.
    expect(events.length).toEqual(3);
    expect(events[0].name).toEqual("subscriptions.create");
    expect(events[1].name).toEqual("subscriptions.create");
    expect(events[2].name).toEqual("subscriptions.create");

    // Each event should point to same document.
    expect(events[0].documentId).toEqual(document.id);
    expect(events[1].documentId).toEqual(document.id);
    expect(events[2].documentId).toEqual(document.id);

    // Events should mention correct `userId`.
    expect(events[0].userId).toEqual(collaborator0.id);
    expect(events[1].userId).toEqual(collaborator1.id);
    expect(events[2].userId).toEqual(collaborator2.id);
  });

  test("should not send multiple emails", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({
      teamId: collaborator0.teamId,
      userId: collaborator0.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    const processor = new NotificationsProcessor();

    // Changing document will emit a `documents.update` event.
    await processor.perform({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      createdAt: document.updatedAt.toString(),
      teamId: document.teamId,
      data: { title: document.title, autosave: false, done: true },
      actorId: collaborator2.id,
      ip,
    });

    // Those changes will also emit a `revisions.create` event.
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    // This should send out 2 emails, one for each collaborator that did not
    // participate in the edit
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  test("should not create subscriptions if previously unsubscribed", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({
      teamId: collaborator0.teamId,
      userId: collaborator0.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    // `collaborator2` created a subscription.
    const subscription2 = await Subscription.create({
      userId: collaborator2.id,
      documentId: document.id,
      event: "documents.update",
    });

    // `collaborator2` would no longer like to be notified.
    await subscription2.destroy();

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    const events = await Event.findAll();

    // Should emit 2 `subscriptions.create` events.
    expect(events.length).toEqual(2);
    expect(events[0].name).toEqual("subscriptions.create");
    expect(events[1].name).toEqual("subscriptions.create");

    // Each event should point to same document.
    expect(events[0].documentId).toEqual(document.id);
    expect(events[1].documentId).toEqual(document.id);

    // Events should mention correct `userId`.
    expect(events[0].userId).toEqual(collaborator0.id);
    expect(events[1].userId).toEqual(collaborator1.id);

    // One notification as one collaborator performed edit and the other is
    // unsubscribed
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  test("should send a notification for subscriptions to non-collaborators", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    // `subscriber` hasn't collaborated on `document`.
    document.collaboratorIds = [collaborator.id];

    await document.save();

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    expect(schedule).toHaveBeenCalled();
  });

  test("should not send a notification for subscriptions to collaborators if unsubscribed", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });

    // `subscriber` has collaborated on `document`.
    document.collaboratorIds = [collaborator.id, subscriber.id];

    await document.save();

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    const subscription = await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    subscription.destroy();

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    // Should send notification to `collaborator` and not `subscriber`.
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  test("should not send a notification for subscriptions to members outside of the team", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });

    // `subscriber` *does not* belong
    // to `collaborator`'s team,
    const subscriber = await buildUser();

    // `subscriber` hasn't collaborated on `document`.
    document.collaboratorIds = [collaborator.id];

    await document.save();

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    // Not sure how they got hold of this document,
    // but let's just pretend they did!
    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    // Should send notification to `collaborator` and not `subscriber`.
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  test("should not send a notification if viewed since update", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const document = await buildDocument();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();

    await View.create({
      userId: collaborator.id,
      documentId: document.id,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to last editor", async () => {
    const schedule = jest.spyOn(
      DocumentNotificationEmail.prototype,
      "schedule"
    );
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    const revision = await Revision.createFromDocument(document);

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: user.id,
      modelId: revision.id,
      ip,
    });
    expect(schedule).not.toHaveBeenCalled();
  });
});
