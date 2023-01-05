import * as React from "react";
import env from "@server/env";
import BaseEmail from "./BaseEmail";
import Body from "./components/Body";
import Button from "./components/Button";
import EmailTemplate from "./components/EmailLayout";
import EmptySpace from "./components/EmptySpace";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Heading from "./components/Heading";

type Props = {
  to: string;
  name: string;
  actorName: string;
  actorEmail: string;
  teamName: string;
  teamUrl: string;
};

/**
 * Email sent to an external user when an admin sends them an invite.
 */
export default class InviteEmail extends BaseEmail<Props> {
  protected subject({ actorName, teamName }: Props) {
    return `${actorName} invited you to join ${teamName}’s knowledge base`;
  }

  protected preview() {
    return `${env.APP_NAME} is a place for your team to build and share knowledge.`;
  }

  protected renderAsText({
    teamName,
    actorName,
    actorEmail,
    teamUrl,
  }: Props): string {
    return `
Join ${teamName} on ${env.APP_NAME}

${actorName} (${actorEmail}) has invited you to join ${env.APP_NAME}, a place for your team to build and share knowledge.

Join now: ${teamUrl}
`;
  }

  protected render({ teamName, actorName, actorEmail, teamUrl }: Props) {
    return (
      <EmailTemplate>
        <Header />

        <Body>
          <Heading>
            Join {teamName} on {env.APP_NAME}
          </Heading>
          <p>
            {actorName} ({actorEmail}) has invited you to join {env.APP_NAME}, a
            place for your team to build and share knowledge.
          </p>
          <EmptySpace height={10} />
          <p>
            <Button href={`${teamUrl}?ref=invite-email`}>Join now</Button>
          </p>
        </Body>

        <Footer />
      </EmailTemplate>
    );
  }
}
