import { uniqBy } from "lodash";
import { Op } from "sequelize";
import subscriptionCreator from "@server/commands/subscriptionCreator";
import { sequelize } from "@server/database/sequelize";
import CollectionNotificationEmail from "@server/emails/templates/CollectionNotificationEmail";
import DocumentNotificationEmail from "@server/emails/templates/DocumentNotificationEmail";
import Logger from "@server/logging/Logger";
import {
  View,
  Document,
  Team,
  Collection,
  User,
  NotificationSetting,
  Subscription,
} from "@server/models";
import { can } from "@server/policies";
import {
  CollectionEvent,
  RevisionEvent,
  Event,
  DocumentEvent,
} from "@server/types";
import BaseProcessor from "./BaseProcessor";

export default class NotificationsProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [
    "documents.publish",
    "revisions.create",
    "collections.create",
  ];

  async perform(event: Event) {
    switch (event.name) {
      case "documents.publish":
      case "revisions.create":
        return this.documentUpdated(event);

      case "collections.create":
        return this.collectionCreated(event);

      default:
    }
  }

  async documentUpdated(event: DocumentEvent | RevisionEvent) {
    // never send notifications when batch importing documents
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'data' does not exist on type 'DocumentEv... Remove this comment to see the full error message
    if (event.data?.source === "import") {
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

    const recipients = await this.getDocumentNotificationRecipients(
      document,
      event.name === "documents.publish"
        ? "documents.publish"
        : "documents.update"
    );

    for (const recipient of recipients) {
      const notify = await this.shouldNotify(document, recipient.user);

      if (notify) {
        await DocumentNotificationEmail.schedule({
          to: recipient.user.email,
          eventName:
            event.name === "documents.publish" ? "published" : "updated",
          documentId: document.id,
          teamUrl: team.url,
          actorName: document.updatedBy.name,
          collectionName: collection.name,
          unsubscribeUrl: recipient.unsubscribeUrl,
        });
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

    const recipients = await this.getCollectionNotificationRecipients(
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
        if (user && can(user, "subscribe", document)) {
          await subscriptionCreator({
            user,
            documentId: document.id,
            event: "documents.update",
            resubscribe: false,
            transaction,
            ip: event.ip,
          });
        }
      }
    });
  };

  /**
   * Get the recipients of a notification for a collection event.
   *
   * @param collection The collection to get recipients for
   * @param eventName The event name
   * @returns A list of recipients
   */
  private getCollectionNotificationRecipients = async (
    collection: Collection,
    eventName: string
  ): Promise<NotificationSetting[]> => {
    // First find all the users that have notifications enabled for this event
    // type at all and aren't the one that performed the action.
    const recipients = await NotificationSetting.scope("withUser").findAll({
      where: {
        userId: {
          [Op.ne]: collection.createdById,
        },
        teamId: collection.teamId,
        event: eventName,
      },
    });

    // Ensure we only have one recipient per user as a safety measure
    return uniqBy(recipients, "userId");
  };

  /**
   * Get the recipients of a notification for a document event.
   *
   * @param document The document to get recipients for
   * @param eventName The event name
   * @returns A list of recipients
   */
  private getDocumentNotificationRecipients = async (
    document: Document,
    eventName: string
  ): Promise<NotificationSetting[]> => {
    // First find all the users that have notifications enabled for this event
    // type at all and aren't the one that performed the action.
    let recipients = await NotificationSetting.scope("withUser").findAll({
      where: {
        userId: {
          [Op.ne]: document.lastModifiedById,
        },
        teamId: document.teamId,
        event: eventName,
      },
    });

    // If the event is a revision creation we can filter further to only those
    // that have a subscription to the document…
    if (eventName === "documents.update") {
      const subscriptions = await Subscription.findAll({
        attributes: ["userId"],
        where: {
          userId: recipients.map((recipient) => recipient.user.id),
          documentId: document.id,
          event: eventName,
        },
      });

      const subscribedUserIds = subscriptions.map(
        (subscription) => subscription.userId
      );

      recipients = recipients.filter((recipient) =>
        subscribedUserIds.includes(recipient.user.id)
      );
    }

    // Ensure we only have one recipient per user as a safety measure
    return uniqBy(recipients, "userId");
  };

  private shouldNotify = async (
    document: Document,
    user: User
  ): Promise<boolean> => {
    // Suppress notifications for suspended and users with no email address
    if (user.isSuspended || !user.email) {
      return false;
    }

    // Check the recipient has access to the collection this document is in. Just
    // because they are subscribed doesn't meant they still have access to read
    // the document.
    const collectionIds = await user.collectionIds();

    if (!collectionIds.includes(document.collectionId)) {
      return false;
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
}
