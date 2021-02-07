// @flow
import { find } from "lodash";
import { observer } from "mobx-react";
import { BackIcon, EmailIcon } from "outline-icons";
import * as React from "react";
import { Redirect, Link, type Location } from "react-router-dom";
import styled from "styled-components";
import getQueryVariable from "shared/utils/getQueryVariable";
import ButtonLarge from "components/ButtonLarge";
import Fade from "components/Fade";
import Flex from "components/Flex";
import Heading from "components/Heading";
import HelpText from "components/HelpText";
import OutlineLogo from "components/OutlineLogo";
import PageTitle from "components/PageTitle";
import TeamLogo from "components/TeamLogo";
import Notices from "./Notices";
import Service from "./Service";
import env from "env";
import useStores from "hooks/useStores";

type Props = {|
  location: Location,
|};

function Login({ location }: Props) {
  const { auth } = useStores();
  const { config } = auth;
  const [emailLinkSentTo, setEmailLinkSentTo] = React.useState("");
  const isCreate = location.pathname === "/create";

  const handleReset = React.useCallback(() => {
    setEmailLinkSentTo("");
  }, []);

  const handleEmailSuccess = React.useCallback((email) => {
    setEmailLinkSentTo(email);
  }, []);

  React.useEffect(() => {
    auth.fetchConfig();
  }, [auth]);

  console.log(config);

  if (auth.authenticated) {
    return <Redirect to="/home" />;
  }

  // we're counting on the config request being fast
  if (!config) {
    return null;
  }

  const hasMultipleServices = config.services.length > 1;
  const defaultService = find(
    config.services,
    (service) => service.id === auth.lastSignedIn && !isCreate
  );

  const header =
    env.DEPLOYMENT === "hosted" &&
    (config.hostname ? (
      <Back href={env.URL}>
        <BackIcon color="currentColor" /> Back to home
      </Back>
    ) : (
      <Back href="https://www.getoutline.com">
        <BackIcon color="currentColor" /> Back to website
      </Back>
    ));

  if (emailLinkSentTo) {
    return (
      <Background>
        {header}
        <Centered align="center" justify="center" column auto>
          <PageTitle title="Check your email" />
          <CheckEmailIcon size={38} color="currentColor" />

          <Heading centered>Check your email</Heading>
          <Note>
            A magic sign-in link has been sent to the email{" "}
            <em>{emailLinkSentTo}</em>, no password needed.
          </Note>
          <br />
          <ButtonLarge onClick={handleReset} fullwidth neutral>
            Back to login
          </ButtonLarge>
        </Centered>
      </Background>
    );
  }

  return (
    <Background>
      {header}
      <Centered align="center" justify="center" column auto>
        <PageTitle title="Login" />
        <Logo>
          {env.TEAM_LOGO && env.DEPLOYMENT !== "hosted" ? (
            <TeamLogo src={env.TEAM_LOGO} />
          ) : (
            <OutlineLogo size={38} fill="currentColor" />
          )}
        </Logo>

        {isCreate ? (
          <Heading centered>Create an account</Heading>
        ) : (
          <Heading centered>Login to {config.name || "Outline"}</Heading>
        )}

        <Notices notice={getQueryVariable("notice")} />

        {defaultService && (
          <React.Fragment key={defaultService.id}>
            <Service
              isCreate={isCreate}
              onEmailSuccess={handleEmailSuccess}
              {...defaultService}
            />
            {hasMultipleServices && (
              <>
                <Note>You signed in with {defaultService.name} last time.</Note>
                <Or />
              </>
            )}
          </React.Fragment>
        )}

        {config.services.map((service) => {
          if (defaultService && service.id === defaultService.id) {
            return null;
          }

          return (
            <Service
              key={service.id}
              isCreate={isCreate}
              onEmailSuccess={handleEmailSuccess}
              {...service}
            />
          );
        })}

        {isCreate && (
          <Note>
            Already have an account? Go to <Link to="/">login</Link>.
          </Note>
        )}
      </Centered>
    </Background>
  );
}

const CheckEmailIcon = styled(EmailIcon)`
  margin-bottom: -1.5em;
`;

const Background = styled(Fade)`
  width: 100vw;
  height: 100vh;
  background: ${(props) => props.theme.background};
  display: flex;
`;

const Logo = styled.div`
  margin-bottom: -1.5em;
  height: 38px;
`;

const Note = styled(HelpText)`
  text-align: center;
  font-size: 14px;

  em {
    font-style: normal;
    font-weight: 500;
  }
`;

const Back = styled.a`
  display: flex;
  align-items: center;
  color: inherit;
  padding: 32px;
  font-weight: 500;
  position: absolute;

  svg {
    transition: transform 100ms ease-in-out;
  }

  &:hover {
    svg {
      transform: translateX(-4px);
    }
  }
`;

const Or = styled.hr`
  margin: 1em 0;
  position: relative;
  width: 100%;

  &:after {
    content: "Or";
    display: block;
    position: absolute;
    left: 50%;
    transform: translate3d(-50%, -50%, 0);
    text-transform: uppercase;
    font-size: 11px;
    color: ${(props) => props.theme.textSecondary};
    background: ${(props) => props.theme.background};
    border-radius: 2px;
    padding: 0 4px;
  }
`;

const Centered = styled(Flex)`
  user-select: none;
  width: 90vw;
  height: 100%;
  max-width: 320px;
  margin: 0 auto;
`;

export default observer(Login);
