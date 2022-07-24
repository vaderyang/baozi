import { sequelize } from "@server/database/sequelize";
import env from "@server/env";
import {
  DomainNotAllowedError,
  InvalidAuthenticationError,
  MaximumTeamsError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import { APM } from "@server/logging/tracing";
import { Team, AuthenticationProvider, Event } from "@server/models";
import { generateAvatarUrl } from "@server/utils/avatars";

type TeamProvisionerResult = {
  team: Team;
  authenticationProvider: AuthenticationProvider;
  isNewTeam: boolean;
};

type Props = {
  /**
   * The internal ID of the team that is being logged into based on the
   * subdomain that the request came from, if any.
   */
  teamId?: string;
  /** The displayed name of the team */
  name: string;
  /** The domain name from the email of the user logging in */
  domain?: string;
  /** The preferred subdomain to provision for the team if not yet created */
  subdomain: string;
  /** The public url of an image representing the team */
  avatarUrl?: string | null;
  /** Details of the authentication provider being used */
  authenticationProvider: {
    /** The name of the authentication provider, eg "google" */
    name: string;
    /** External identifier of the authentication provider */
    providerId: string;
  };
  /** The IP address of the incoming request */
  ip: string;
};

async function teamProvisioner({
  teamId,
  name,
  domain,
  subdomain,
  avatarUrl,
  authenticationProvider,
  ip,
}: Props): Promise<TeamProvisionerResult> {
  let authP = await AuthenticationProvider.findOne({
    where: teamId
      ? { ...authenticationProvider, teamId }
      : authenticationProvider,
    include: [
      {
        model: Team,
        as: "team",
        required: true,
      },
    ],
  });

  // This authentication provider already exists which means we have a team and
  // there is nothing left to do but return the existing credentials
  if (authP) {
    return {
      authenticationProvider: authP,
      team: authP.team,
      isNewTeam: false,
    };
  } else if (teamId) {
    // The user is attempting to log into a team with an unfamiliar SSO provider
    throw InvalidAuthenticationError();
  }

  // This team has never been seen before, if self hosted the logic is different
  // to the multi-tenant version, we want to restrict to a single team that MAY
  // have multiple authentication providers
  if (env.DEPLOYMENT !== "hosted") {
    const team = await Team.findOne();

    // If the self-hosted installation has a single team and the domain for the
    // new team is allowed then assign the authentication provider to the
    // existing team
    if (team && domain) {
      if (await team.isDomainAllowed(domain)) {
        authP = await team.$create<AuthenticationProvider>(
          "authenticationProvider",
          authenticationProvider
        );
        return {
          authenticationProvider: authP,
          team,
          isNewTeam: false,
        };
      } else {
        throw DomainNotAllowedError();
      }
    }

    if (team) {
      throw MaximumTeamsError();
    }
  }

  // If the service did not provide a logo/avatar then we attempt to generate
  // one via ClearBit, or fallback to colored initials in worst case scenario
  if (!avatarUrl) {
    avatarUrl = await generateAvatarUrl({
      name,
      domain,
      id: subdomain,
    });
  }

  const team = await sequelize.transaction(async (transaction) => {
    const team = await Team.create(
      {
        name,
        avatarUrl,
        authenticationProviders: [authenticationProvider],
      },
      {
        include: "authenticationProviders",
        transaction,
      }
    );

    await Event.create(
      {
        name: "teams.create",
        teamId: team.id,
        ip,
      },
      {
        transaction,
      }
    );

    return team;
  });

  // Note provisioning the subdomain is done outside of the transaction as
  // it is allowed to fail and the team can still be created, it also requires
  // failed queries as part of iteration
  try {
    await provisionSubdomain(team, subdomain);
  } catch (err) {
    Logger.error("Provisioning subdomain failed", err, {
      teamId: team.id,
      subdomain,
    });
  }

  return {
    team,
    authenticationProvider: team.authenticationProviders[0],
    isNewTeam: true,
  };
}

async function provisionSubdomain(team: Team, requestedSubdomain: string) {
  if (team.subdomain) {
    return team.subdomain;
  }
  let subdomain = requestedSubdomain;
  let append = 0;

  for (;;) {
    try {
      await team.update({
        subdomain,
      });
      break;
    } catch (err) {
      // subdomain was invalid or already used, try again
      subdomain = `${requestedSubdomain}${++append}`;
    }
  }

  return subdomain;
}

export default APM.traceFunction({
  serviceName: "command",
  spanName: "teamProvisioner",
})(teamProvisioner);
