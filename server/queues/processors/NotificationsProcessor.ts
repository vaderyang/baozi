import { subHours } from "date-fns";
import { Op } from "sequelize";
import { Minute } from "@shared/utils/time";
import subscriptionCreator from "@server/commands/subscriptionCreator";
import { sequelize } from "@server/database/sequelize";
import CollectionNotificationEmail from "@server/emails/templates/CollectionNotificationEmail";
import DocumentNotificationEmail from "@server/emails/templates/DocumentNotificationEmail";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import {
  Document,
  Team,
  Collection,
  Notification,
  Revision,
  User,
  View,
} from "@server/models";
import DocumentHelper from "@server/models/helpers/DocumentHelper";
import NotificationHelper from "@server/models/helpers/NotificationHelper";
import {
  CollectionEvent,
  RevisionEvent,
  Event,
  DocumentEvent,
  CommentEvent,
} from "@server/types";
import CommentCreatedNotificationTask from "../tasks/CommentCreatedNotificationTask";
import BaseProcessor from "./BaseProcessor";

export default class NotificationsProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [
    "documents.publish",
    "revisions.create",
    "collections.create",
    "comments.create",
  ];

  async perform(event: Event) {
    switch (event.name) {
      case "documents.publish":
        return this.documentPublished(event);
      case "revisions.create":
        return this.revisionCreated(event);
      case "collections.create":
        return this.collectionCreated(event);
      case "comments.create":
        return this.commentCreated(event);
      default:
    }
  }

  async commentCreated(event: CommentEvent) {
    await CommentCreatedNotificationTask.schedule(event, {
      delay: Minute,
    });
  }

  async documentPublished(event: DocumentEvent) {
    // never send notifications when batch importing documents
    if (
      "data" in event &&
      "source" in event.data &&
      event.data.source === "import"
    ) {
      return;
    }

    const [collection, document, team] = await Promise.all([
      Collection.findByPk(event.collectionId),
      Document.findByPk(event.documentId),
      Team.findByPk(event.teamId),
    ]);

    if (!document || !team || !collection) {
      return;
    }

    await this.createDocumentSubscriptions(document, event);

    const recipients = await NotificationHelper.getDocumentNotificationRecipients(
      document,
      "documents.publish",
      document.lastModifiedById
    );

    for (const recipient of recipients) {
      const notify = await this.shouldNotify(document, recipient.user);

      if (notify) {
        const notification = await Notification.create({
          event: event.name,
          userId: recipient.user.id,
          actorId: document.updatedBy.id,
          teamId: team.id,
          documentId: document.id,
        });
        await DocumentNotificationEmail.schedule(
          {
            to: recipient.user.email,
            eventName: "published",
            documentId: document.id,
            teamUrl: team.url,
            actorName: document.updatedBy.name,
            collectionName: collection.name,
            unsubscribeUrl: recipient.unsubscribeUrl,
          },
          { notificationId: notification.id }
        );
      }
    }
  }

  async revisionCreated(event: RevisionEvent) {
    const [collection, document, revision, team] = await Promise.all([
      Collection.findByPk(event.collectionId),
      Document.findByPk(event.documentId),
      Revision.findByPk(event.modelId),
      Team.findByPk(event.teamId),
    ]);

    if (!document || !team || !revision || !collection) {
      return;
    }

    await this.createDocumentSubscriptions(document, event);

    const recipients = await NotificationHelper.getDocumentNotificationRecipients(
      document,
      "documents.update",
      document.lastModifiedById
    );
    if (!recipients.length) {
      return;
    }

    // generate the diff html for the email
    const before = await revision.previous();
    const content = await DocumentHelper.toEmailDiff(before, revision, {
      includeTitle: false,
      centered: false,
      signedUrls: 86400 * 4,
    });
    if (!content) {
      return;
    }

    for (const recipient of recipients) {
      const notify = await this.shouldNotify(document, recipient.user);

      if (notify) {
        const notification = await Notification.create({
          event: event.name,
          userId: recipient.user.id,
          actorId: document.updatedBy.id,
          teamId: team.id,
          documentId: document.id,
        });

        await DocumentNotificationEmail.schedule(
          {
            to: recipient.user.email,
            eventName: "updated",
            documentId: document.id,
            teamUrl: team.url,
            actorName: document.updatedBy.name,
            collectionName: collection.name,
            unsubscribeUrl: recipient.unsubscribeUrl,
            content,
          },
          { notificationId: notification.id }
        );
      }
    }
  }

  async collectionCreated(event: CollectionEvent) {
    const collection = await Collection.scope("withUser").findByPk(
      event.collectionId
    );

    if (!collection || !collection.permission) {
      return;
    }

    const recipients = await NotificationHelper.getCollectionNotificationRecipients(
      collection,
      event.name
    );

    for (const recipient of recipients) {
      // Suppress notifications for suspended users
      if (recipient.user.isSuspended || !recipient.user.email) {
        continue;
      }

      await CollectionNotificationEmail.schedule({
        to: recipient.user.email,
        eventName: "created",
        collectionId: collection.id,
        unsubscribeUrl: recipient.unsubscribeUrl,
      });
    }
  }

  private shouldNotify = async (
    document: Document,
    user: User
  ): Promise<boolean> => {
    // Deliver only a single notification in a 12 hour window
    const notification = await Notification.findOne({
      order: [["createdAt", "DESC"]],
      where: {
        userId: user.id,
        documentId: document.id,
        emailedAt: {
          [Op.not]: null,
          [Op.gte]: subHours(new Date(), 12),
        },
      },
    });

    if (notification) {
      if (env.ENVIRONMENT === "development") {
        Logger.info(
          "processor",
          `would have suppressed notification to ${user.id}, but not in development`
        );
      } else {
        Logger.info(
          "processor",
          `suppressing notification to ${user.id} as recently notified`
        );
        return false;
      }
    }

    // If this recipient has viewed the document since the last update was made
    // then we can avoid sending them a useless notification, yay.
    const view = await View.findOne({
      where: {
        userId: user.id,
        documentId: document.id,
        updatedAt: {
          [Op.gt]: document.updatedAt,
        },
      },
    });

    if (view) {
      Logger.info(
        "processor",
        `suppressing notification to ${user.id} because update viewed`
      );
      return false;
    }

    return true;
  };

  /**
   * Create any new subscriptions that might be missing for collaborators in the
   * document on publish and revision creation. This does mean that there is a
   * short period of time where the user is not subscribed after editing until a
   * revision is created.
   *
   * @param document The document to create subscriptions for
   * @param event The event that triggered the subscription creation
   */
  private createDocumentSubscriptions = async (
    document: Document,
    event: DocumentEvent | RevisionEvent
  ): Promise<void> => {
    await sequelize.transaction(async (transaction) => {
      const users = await document.collaborators({ transaction });

      for (const user of users) {
        await subscriptionCreator({
          user,
          documentId: document.id,
          event: "documents.update",
          resubscribe: false,
          transaction,
          ip: event.ip,
        });
      }
    });
  };
}
