import passport from "@outlinewiki/koa-passport";
import type { Context } from "koa";
import Router from "koa-router";
import { capitalize } from "lodash";
import { Profile } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import { slugifyDomain } from "@shared/utils/domains";
import accountProvisioner, {
  AccountProvisionerResult,
} from "@server/commands/accountProvisioner";
import env from "@server/env";
import {
  GmailAccountCreationError,
  InviteRequiredError,
  TeamDomainRequiredError,
} from "@server/errors";
import passportMiddleware from "@server/middlewares/passport";
import { User } from "@server/models";
import { StateStore, getTeamFromContext } from "@server/utils/passport";

const router = new Router();
const providerName = "google";
const scopes = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const config = {
  name: "Google",
  enabled: !!env.GOOGLE_CLIENT_ID,
};

type GoogleProfile = Profile & {
  email: string;
  picture: string;
  _json: {
    hd: string;
  };
};

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.URL}/auth/google.callback`,
        passReqToCallback: true,
        // @ts-expect-error StateStore
        store: new StateStore(),
        scope: scopes,
      },
      async function (
        ctx: Context,
        accessToken: string,
        refreshToken: string,
        params: { expires_in: number },
        profile: GoogleProfile,
        done: (
          err: Error | null,
          user: User | null,
          result?: AccountProvisionerResult
        ) => void
      ) {
        try {
          let result;

          // "domain" is the Google Workspaces domain
          const domain = profile._json.hd;
          const team = await getTeamFromContext(ctx);

          // Existence of domain means this is a Google Workspaces account
          // so we'll attempt to provision an account (team and user)
          if (domain) {
            // remove the TLD and form a subdomain from the remaining
            // subdomains of the form "foo.bar.com" are allowed as primary Google Workspaces domains
            // see https://support.google.com/nonprofits/thread/19685140/using-a-subdomain-as-a-primary-domain
            const subdomain = slugifyDomain(domain);
            const teamName = capitalize(subdomain);

            // Request a larger size profile picture than the default by tweaking
            // the query parameter.
            const avatarUrl = profile.picture.replace("=s96-c", "=s128-c");

            // if a team can be inferred, we assume the user is only interested in signing into
            // that team in particular; otherwise, we will do a best effort at finding their account
            // or provisioning a new one (within AccountProvisioner)
            result = await accountProvisioner({
              ip: ctx.ip,
              team: {
                id: team?.id,
                name: teamName,
                domain,
                subdomain,
              },
              user: {
                email: profile.email,
                name: profile.displayName,
                avatarUrl,
              },
              authenticationProvider: {
                name: providerName,
                providerId: domain,
              },
              authentication: {
                providerId: profile.id,
                accessToken,
                refreshToken,
                expiresIn: params.expires_in,
                scopes,
              },
            });
          } else {
            // No domain means it's a personal Gmail account
            // We only allow sign-in to existing user accounts with these
            if (!team) {
              // No team usually means this is the apex domain
              // Throw different errors depending on whether we think the user is
              // trying to create a new account, or log-in to an existing one
              const userExists = await User.count({
                where: { email: profile.email.toLowerCase() },
              });

              if (!userExists) {
                throw GmailAccountCreationError();
              }

              throw TeamDomainRequiredError();
            }

            const user = await User.findOne({
              where: { teamId: team.id, email: profile.email.toLowerCase() },
            });

            if (!user) {
              throw InviteRequiredError();
            }

            result = {
              user,
              team,
              isNewUser: false,
              isNewTeam: false,
            };
          }

          return done(null, result.user, result);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  router.get(
    "google",
    passport.authenticate(providerName, {
      accessType: "offline",
      prompt: "select_account consent",
    })
  );

  router.get("google.callback", passportMiddleware(providerName));
}

export default router;
