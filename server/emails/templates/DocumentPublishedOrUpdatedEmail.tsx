import inlineCss from "inline-css";
import * as React from "react";
import { NotificationEventType } from "@shared/types";
import { Day } from "@shared/utils/time";
import env from "@server/env";
import { Document, Collection, User, Revision } from "@server/models";
import DocumentHelper from "@server/models/helpers/DocumentHelper";
import NotificationSettingsHelper from "@server/models/helpers/NotificationSettingsHelper";
import BaseEmail, { EmailProps } from "./BaseEmail";
import Body from "./components/Body";
import Button from "./components/Button";
import Diff from "./components/Diff";
import EmailTemplate from "./components/EmailLayout";
import EmptySpace from "./components/EmptySpace";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Heading from "./components/Heading";

type InputProps = EmailProps & {
  userId: string;
  documentId: string;
  revisionId?: string;
  actorName: string;
  eventType:
    | NotificationEventType.PublishDocument
    | NotificationEventType.UpdateDocument;
  teamUrl: string;
};

type BeforeSend = {
  document: Document;
  collection: Collection;
  unsubscribeUrl: string;
  body: string | undefined;
};

type Props = InputProps & BeforeSend;

/**
 * Email sent to a user when they have enabled document notifications, the event
 * may be published or updated.
 */
export default class DocumentPublishedOrUpdatedEmail extends BaseEmail<
  InputProps,
  BeforeSend
> {
  protected async beforeSend({
    documentId,
    revisionId,
    eventType,
    userId,
  }: InputProps) {
    const document = await Document.unscoped().findByPk(documentId, {
      includeState: true,
    });
    if (!document) {
      return false;
    }

    const collection = await document.$get("collection");
    if (!collection) {
      return false;
    }

    let body;
    if (revisionId) {
      // generate the diff html for the email
      const revision = await Revision.findByPk(revisionId);

      if (revision) {
        const before = await revision.previous();
        const content = await DocumentHelper.toEmailDiff(before, revision, {
          includeTitle: false,
          centered: false,
          signedUrls: (4 * Day) / 1000,
        });

        // inline all css so that it works in as many email providers as possible.
        body = content
          ? await inlineCss(content, {
              url: env.URL,
              applyStyleTags: true,
              applyLinkTags: false,
              removeStyleTags: true,
            })
          : undefined;
      }
    }

    return {
      document,
      collection,
      body,
      unsubscribeUrl: NotificationSettingsHelper.unsubscribeUrl(
        await User.findByPk(userId, { rejectOnEmpty: true }),
        eventType
      ),
    };
  }

  eventName(eventType: NotificationEventType) {
    switch (eventType) {
      case NotificationEventType.PublishDocument:
        return "published";
      case NotificationEventType.UpdateDocument:
        return "updated";
      default:
        return "";
    }
  }

  protected subject({ document, eventType }: Props) {
    return `“${document.title}” ${this.eventName(eventType)}`;
  }

  protected preview({ actorName, eventType }: Props): string {
    return `${actorName} ${this.eventName(eventType)} a document`;
  }

  protected renderAsText({
    actorName,
    teamUrl,
    document,
    collection,
    eventType,
  }: Props): string {
    const eventName = this.eventName(eventType);

    return `
"${document.title}" ${eventName}

${actorName} ${eventName} the document "${document.title}", in the ${collection.name} collection.

Open Document: ${teamUrl}${document.url}
`;
  }

  protected render({
    document,
    actorName,
    collection,
    eventType,
    teamUrl,
    unsubscribeUrl,
    body,
  }: Props) {
    const link = `${teamUrl}${document.url}?ref=notification-email`;
    const eventName = this.eventName(eventType);

    return (
      <EmailTemplate>
        <Header />

        <Body>
          <Heading>
            “{document.title}” {eventName}
          </Heading>
          <p>
            {actorName} {eventName} the document{" "}
            <a href={link}>{document.title}</a>, in the {collection.name}{" "}
            collection.
          </p>
          {body && (
            <>
              <EmptySpace height={20} />
              <Diff>
                <div dangerouslySetInnerHTML={{ __html: body }} />
              </Diff>
              <EmptySpace height={20} />
            </>
          )}
          <p>
            <Button href={link}>Open Document</Button>
          </p>
        </Body>

        <Footer unsubscribeUrl={unsubscribeUrl} />
      </EmailTemplate>
    );
  }
}
