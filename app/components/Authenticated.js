// @flow
import { observer, inject } from "mobx-react";
import * as React from "react";
import { Redirect } from "react-router-dom";
import { isCustomSubdomain } from "shared/utils/domains";
import AuthStore from "stores/AuthStore";
import LoadingIndicator from "components/LoadingIndicator";
import env from "env";

type Props = {
  auth: AuthStore,
  children?: React.Node,
};

const Authenticated = observer(({ auth, children }: Props) => {
  if (auth.authenticated) {
    const { user, team } = auth;
    const { hostname } = window.location;

    if (!team || !user) {
      return <LoadingIndicator />;
    }

    // If we're authenticated but viewing a domain that doesn't match the
    // current team then kick the user to the teams correct domain.
    if (team.domain) {
      if (team.domain !== hostname) {
        window.location.href = `${team.url}${window.location.pathname}`;
        return <LoadingIndicator />;
      }
    } else if (
      env.SUBDOMAINS_ENABLED &&
      team.subdomain &&
      isCustomSubdomain(hostname) &&
      !hostname.startsWith(`${team.subdomain}.`)
    ) {
      window.location.href = `${team.url}${window.location.pathname}`;
      return <LoadingIndicator />;
    }

    return children;
  }

  auth.logout(true);
  return <Redirect to="/" />;
});

export default inject("auth")(Authenticated);
