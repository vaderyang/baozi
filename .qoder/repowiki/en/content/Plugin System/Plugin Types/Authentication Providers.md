# Authentication Providers

<cite>
**Referenced Files in This Document**   
- [plugin.json](file://plugins/github/plugin.json)
- [plugin.json](file://plugins/google/plugin.json)
- [plugin.json](file://plugins/azure/plugin.json)
- [plugin.json](file://plugins/oidc/plugin.json)
- [env.ts](file://app/env.ts)
- [env.ts](file://server/env.ts)
- [env.ts](file://plugins/github/server/env.ts)
- [env.ts](file://plugins/google/server/env.ts)
- [env.ts](file://plugins/azure/server/env.ts)
- [env.ts](file://plugins/oidc/server/env.ts)
- [AuthenticationHelper.ts](file://server/models/helpers/AuthenticationHelper.ts)
- [index.ts](file://plugins/oidc/server/index.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication Provider Plugins](#authentication-provider-plugins)
3. [Configuration and Environment Variables](#configuration-and-environment-variables)
4. [Plugin Implementation Details](#plugin-implementation-details)
5. [Authentication Flow and Token Handling](#authentication-flow-and-token-handling)
6. [User Provisioning and SSO Configuration](#user-provisioning-and-sso-configuration)
7. [Extending AuthenticationHelper and Passport Strategies](#extending-authenticationhelper-and-passport-strategies)
8. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
9. [Implementing New Authentication Providers](#implementing-new-authentication-providers)
10. [Security Considerations](#security-considerations)

## Introduction
The baozi application supports multiple authentication provider plugins, enabling users to authenticate via OAuth-based providers such as GitHub, Google, Azure AD, and OIDC. These plugins integrate seamlessly with the core authentication middleware, providing a flexible and secure authentication framework. This document details the implementation of these authentication providers, their configuration, and integration with the application's authentication system.

## Authentication Provider Plugins
The baozi application includes several authentication provider plugins, each designed to support a specific OAuth-based provider. These plugins are located in the `plugins` directory and are structured to include both client and server components. The plugins for GitHub, Google, Azure AD, and OIDC are implemented as follows:

- **GitHub**: Enables authentication with GitHub using OAuth2.
- **Google**: Adds Google as an authentication provider.
- **Azure AD**: Integrates Microsoft Azure AD for authentication.
- **OIDC**: Supports OpenID Connect compatible providers.

Each plugin is defined by a `plugin.json` file that specifies the plugin's ID, name, priority, and description. For example, the GitHub plugin is configured as follows:

```json
{
  "id": "github",
  "name": "GitHub",
  "priority": 10,
  "description": "Adds a GitHub integration for link unfurling."
}
```

**Section sources**
- [plugin.json](file://plugins/github/plugin.json#L1-L7)
- [plugin.json](file://plugins/google/plugin.json#L1-L7)
- [plugin.json](file://plugins/azure/plugin.json#L1-L7)
- [plugin.json](file://plugins/oidc/plugin.json#L1-L7)

## Configuration and Environment Variables
Authentication provider plugins are configured using environment variables defined in the `env.ts` files within each plugin's server directory. These variables include client IDs, client secrets, and other provider-specific settings. The main application environment variables are defined in `app/env.ts` and `server/env.ts`, while plugin-specific variables are defined in their respective `env.ts` files.

For example, the GitHub plugin uses the following environment variables:

```typescript
@Public
@IsOptional()
public GITHUB_CLIENT_ID = this.toOptionalString(environment.GITHUB_CLIENT_ID);

@Public
@IsOptional()
@CannotUseWithout("GITHUB_CLIENT_ID")
public GITHUB_APP_NAME = this.toOptionalString(environment.GITHUB_APP_NAME);

@IsOptional()
@CannotUseWithout("GITHUB_CLIENT_ID")
public GITHUB_CLIENT_SECRET = this.toOptionalString(environment.GITHUB_CLIENT_SECRET);
```

Similarly, the OIDC plugin includes variables for the issuer URL, display name, and scopes:

```typescript
@IsOptional()
@IsUrl({
  require_tld: false,
  allow_underscores: true,
})
public OIDC_ISSUER_URL = this.toOptionalString(environment.OIDC_ISSUER_URL);

@MaxLength(50)
public OIDC_DISPLAY_NAME = environment.OIDC_DISPLAY_NAME ?? "OpenID Connect";

public OIDC_SCOPES = environment.OIDC_SCOPES ?? "openid profile email";
```

**Section sources**
- [env.ts](file://app/env.ts#L1-L16)
- [env.ts](file://server/env.ts#L1-L800)
- [env.ts](file://plugins/github/server/env.ts#L1-L47)
- [env.ts](file://plugins/google/server/env.ts#L1-L22)
- [env.ts](file://plugins/azure/server/env.ts#L1-L31)
- [env.ts](file://plugins/oidc/server/env.ts#L1-L111)

## Plugin Implementation Details
Each authentication provider plugin is implemented as a server-side module that registers with the application's plugin manager. The plugin manager handles the registration and configuration of authentication providers, ensuring they are available for use during the authentication process.

For example, the OIDC plugin registers itself with the plugin manager in the `index.ts` file:

```typescript
import Logger from "@server/logging/Logger";
import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./auth/oidc";
import env from "./env";

const hasManualConfig = !!(
  env.OIDC_CLIENT_ID &&
  env.OIDC_CLIENT_SECRET &&
  env.OIDC_AUTH_URI &&
  env.OIDC_TOKEN_URI &&
  env.OIDC_USERINFO_URI
);

const hasIssuerConfig = !!(
  env.OIDC_CLIENT_ID &&
  env.OIDC_CLIENT_SECRET &&
  env.OIDC_ISSUER_URL
);

const enabled = hasManualConfig || hasIssuerConfig;

if (enabled) {
  PluginManager.add({
    ...config,
    type: Hook.AuthProvider,
    value: { router, id: config.id },
    name: env.OIDC_DISPLAY_NAME || config.name,
  });
  Logger.info("plugins", "OIDC plugin registered");
}
```

This registration process ensures that the OIDC provider is available for authentication and that its routes are properly configured.

**Section sources**
- [index.ts](file://plugins/oidc/server/index.ts#L1-L33)

## Authentication Flow and Token Handling
The authentication flow for OAuth-based providers follows the standard OAuth2 authorization code grant flow. When a user initiates authentication, they are redirected to the provider's authorization endpoint. Upon successful authentication, the provider redirects the user back to the application with an authorization code. The application then exchanges this code for an access token and, optionally, a refresh token.

The `AuthenticationHelper` class manages the authentication providers and their configurations. It provides methods to retrieve the enabled providers and to determine which providers are available for a specific team:

```typescript
export default class AuthenticationHelper {
  public static get providers() {
    return PluginManager.getHooks(Hook.AuthProvider);
  }

  public static providersForTeam(team?: Team) {
    const isCloudHosted = env.isCloudHosted;

    return AuthenticationHelper.providers
      .sort((hook) => (hook.value.id === "email" ? 1 : -1))
      .filter((hook) => {
        if (hook.value.id === "email") {
          return team?.emailSigninEnabled;
        }

        if (!team) {
          return true;
        }
      });
  }
}
```

**Section sources**
- [AuthenticationHelper.ts](file://server/models/helpers/AuthenticationHelper.ts#L1-L40)

## User Provisioning and SSO Configuration
User provisioning is handled automatically when a user authenticates via an OAuth provider. The application retrieves the user's profile information from the provider's userinfo endpoint and creates or updates the user's account in the database. Single Sign-On (SSO) configuration is supported through the OIDC plugin, which allows for automatic discovery of endpoints via the well-known configuration endpoint.

The OIDC plugin can be configured to use either manual endpoint configuration or automatic discovery via the issuer URL. This flexibility allows the plugin to support a wide range of OIDC-compatible providers.

**Section sources**
- [env.ts](file://plugins/oidc/server/env.ts#L1-L111)

## Extending AuthenticationHelper and Passport Strategies
The `AuthenticationHelper` class and Passport strategies are extended by the authentication provider plugins to support additional providers. Each plugin registers its own router and authentication endpoints, which are then integrated into the application's authentication middleware.

For example, the OIDC plugin extends the `AuthenticationHelper` by registering its router and configuration with the plugin manager. This allows the plugin to handle authentication requests and to provide the necessary endpoints for the OAuth2 flow.

**Section sources**
- [AuthenticationHelper.ts](file://server/models/helpers/AuthenticationHelper.ts#L1-L40)
- [index.ts](file://plugins/oidc/server/index.ts#L1-L33)

## Common Issues and Troubleshooting
Common issues with authentication provider plugins include token expiration, scope management, and SSO configuration. Token expiration can be mitigated by using refresh tokens to obtain new access tokens. Scope management is handled through the `OIDC_SCOPES` environment variable, which specifies the scopes requested during authentication.

SSO configuration issues can arise if the issuer URL is not correctly configured or if the provider's endpoints are not accessible. Ensuring that the issuer URL and other endpoint URLs are correctly specified in the environment variables can resolve these issues.

**Section sources**
- [env.ts](file://plugins/oidc/server/env.ts#L1-L111)

## Implementing New Authentication Providers
To implement a new authentication provider, create a new plugin directory with the necessary client and server components. Define the plugin's configuration in a `plugin.json` file and implement the server-side logic in the `server` directory. The plugin should register with the plugin manager and provide the necessary routes and endpoints for the authentication flow.

The new plugin should also define any required environment variables in its `env.ts` file and ensure that these variables are properly validated and configured.

**Section sources**
- [plugin.json](file://plugins/github/plugin.json#L1-L7)
- [env.ts](file://plugins/github/server/env.ts#L1-L47)

## Security Considerations
Security considerations for authentication provider plugins include proper handling of credentials, secure storage of tokens, and protection against common vulnerabilities such as CSRF and XSS. Environment variables should be securely managed and not exposed in client-side code. Tokens should be stored securely and refreshed as needed to maintain user sessions.

Additionally, the application should enforce secure communication (HTTPS) and validate all input to prevent injection attacks.

**Section sources**
- [env.ts](file://server/env.ts#L1-L800)
- [AuthenticationHelper.ts](file://server/models/helpers/AuthenticationHelper.ts#L1-L40)