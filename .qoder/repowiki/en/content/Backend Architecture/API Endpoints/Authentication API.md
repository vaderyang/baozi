# Authentication API

<cite>
**Referenced Files in This Document**   
- [authentication.ts](file://server/middlewares/authentication.ts)
- [csrf.ts](file://server/middlewares/csrf.ts)
- [passport.ts](file://server/middlewares/passport.ts)
- [UserAuthentication.ts](file://server/models/UserAuthentication.ts)
- [AuthStore.ts](file://app/stores/AuthStore.ts)
- [OAuthAuthentication.ts](file://app/models/oauth/OAuthAuthentication.ts)
- [OAuthClient.ts](file://app/models/oauth/OAuthClient.ts)
- [AuthenticationProvider.ts](file://app/models/AuthenticationProvider.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Middleware Chain](#middleware-chain)
4. [Zod Validation Schemas](#zod-validation-schemas)
5. [OAuth Integration](#oauth-integration)
6. [Security Considerations](#security-considerations)
7. [Frontend Integration](#frontend-integration)
8. [Common Issues](#common-issues)
9. [Conclusion](#conclusion)

## Introduction
The baozi application provides a comprehensive authentication system supporting multiple authentication methods including email/password, OAuth providers (Google, GitHub, Slack), and API keys. This documentation details the authentication endpoints, middleware chain, validation schemas, and integration patterns used throughout the application.

The authentication system is built on a robust foundation of middleware components that handle CSRF protection, session validation, token handling, and role-based access control. The system supports both cookie-based and token-based authentication flows, with comprehensive security measures including password hashing, session expiration, and brute-force protection.

**Section sources**
- [authentication.ts](file://server/middlewares/authentication.ts#L1-L280)
- [AuthStore.ts](file://app/stores/AuthStore.ts#L1-L364)

## Authentication Endpoints

### Login Endpoint
The login endpoint handles authentication requests and returns appropriate tokens based on the authentication method used. The endpoint supports multiple authentication transports including cookies, headers, body, and query parameters.

```mermaid
sequenceDiagram
participant Client
participant Server
participant AuthMiddleware
participant UserDB
Client->>Server : POST /auth.login
Server->>AuthMiddleware : parseAuthentication()
AuthMiddleware->>AuthMiddleware : Extract token from header/cookie/body/query
AuthMiddleware->>UserDB : Validate credentials
UserDB-->>AuthMiddleware : Return user object
AuthMiddleware->>Server : Set authentication context
Server-->>Client : 200 OK with session/token
```

**Diagram sources**
- [authentication.ts](file://server/middlewares/authentication.ts#L37-L85)

### Logout Endpoint
The logout endpoint invalidates the user's authentication token and clears session data. The endpoint supports optional path saving and token revocation.

```mermaid
flowchart TD
Start([Logout Request]) --> CheckSavePath["Check if path should be saved"]
CheckSavePath --> |Yes| SavePath["Save current path"]
CheckSavePath --> |No| SkipSave
SavePath --> RevokeToken["Revoke authentication token"]
SkipSave --> RevokeToken
RevokeToken --> ClearSession["Clear session data"]
ClearSession --> ClearCache["Clear local cache"]
ClearCache --> Redirect["Redirect to login page"]
Redirect --> End([Logout Complete])
```

**Diagram sources**
- [AuthStore.ts](file://app/stores/AuthStore.ts#L313-L362)

### Session Management Endpoints
The session management endpoints handle session validation, token refresh, and active session tracking. These endpoints ensure that user sessions remain valid and secure throughout their usage.

**Section sources**
- [UserAuthentication.ts](file://server/models/UserAuthentication.ts#L1-L207)
- [authentication.ts](file://server/middlewares/authentication.ts#L145-L279)

## Middleware Chain

### Authentication Middleware
The authentication middleware is responsible for parsing and validating authentication tokens from various sources. It supports multiple authentication types including OAuth, API keys, and application sessions.

```mermaid
classDiagram
class AuthenticationOptions {
+role : UserRole
+type : AuthenticationType | AuthenticationType[]
+optional : boolean
}
class AuthInput {
+token : string
+transport : AuthTransport
}
class AuthTransport {
<<enumeration>>
cookie
header
body
query
}
class AuthenticationType {
<<enumeration>>
APP
OAUTH
API
}
AuthenticationOptions --> AuthInput : "uses"
AuthenticationOptions --> AuthenticationType : "references"
```

**Diagram sources**
- [authentication.ts](file://server/middlewares/authentication.ts#L19-L26)

### CSRF Protection Middleware
The CSRF protection middleware implements a double-submit cookie pattern to prevent cross-site request forgery attacks. It generates and validates CSRF tokens for mutating requests while allowing safe methods to proceed without protection.

```mermaid
sequenceDiagram
participant Client
participant Server
participant CSRFMiddleware
Client->>Server : GET /page
Server->>CSRFMiddleware : attachCSRFToken()
CSRFMiddleware->>Server : Generate and set CSRF cookie
Server-->>Client : Page with CSRF token
Client->>Server : POST /api/data
Server->>CSRFMiddleware : verifyCSRFToken()
CSRFMiddleware->>CSRFMiddleware : Check cookie and header tokens
CSRFMiddleware->>CSRFMiddleware : Verify tokens match
CSRFMiddleware-->>Server : Proceed with request
Server-->>Client : 200 OK
```

**Diagram sources**
- [csrf.ts](file://server/middlewares/csrf.ts#L21-L46)
- [csrf.ts](file://server/middlewares/csrf.ts#L52-L155)

### Passport Middleware
The passport middleware handles OAuth authentication flows, managing the authorization process with external providers and handling authentication results.

```mermaid
flowchart TD
Start([OAuth Request]) --> CheckError["Check for authentication errors"]
CheckError --> |Error| HandleError["Handle authentication error"]
HandleError --> Redirect["Redirect with error notice"]
CheckError --> |No Error| CheckUser["Check for user and result"]
CheckUser --> |No User| HandleNoUser["Handle no user case"]
CheckUser --> |User Present| ValidateUser["Validate user suspension status"]
ValidateUser --> |Suspended| RedirectSuspended["Redirect with suspension notice"]
ValidateUser --> |Active| SignIn["Complete sign-in process"]
SignIn --> End([Authentication Complete])
```

**Diagram sources**
- [passport.ts](file://server/middlewares/passport.ts#L12-L100)

**Section sources**
- [csrf.ts](file://server/middlewares/csrf.ts#L1-L156)
- [passport.ts](file://server/middlewares/passport.ts#L1-L101)

## Zod Validation Schemas
The authentication system uses Zod for request validation, ensuring that all incoming requests conform to expected schemas. The validation schemas cover authentication requests, OAuth flows, and session management operations.

```mermaid
classDiagram
class AuthenticationProvidersInfoSchema {
+body : z.object
+id : z.string().uuid()
}
class AuthenticationProvidersUpdateSchema {
+body : z.object
+id : z.string().uuid()
+isEnabled : z.boolean()
}
class OAuthAuthenticationSchema {
+scope : z.array(z.string())
+accessToken : z.string()
+refreshToken : z.string()
+expiresAt : z.date()
}
AuthenticationProvidersInfoSchema <|-- AuthenticationProvidersUpdateSchema
AuthenticationProvidersUpdateSchema <|-- OAuthAuthenticationSchema
```

**Diagram sources**
- [schema.ts](file://server/routes/api/authenticationProviders/schema.ts#L3-L8)
- [schema.ts](file://server/routes/api/authenticationProviders/schema.ts#L14-L22)

**Section sources**
- [schema.ts](file://server/routes/api/authenticationProviders/schema.ts#L3-L26)

## OAuth Integration

### Supported Providers
The baozi application supports integration with multiple OAuth providers including Google, GitHub, Slack, and Azure. Each provider is configured through the AuthenticationProvider model, which manages provider-specific settings and credentials.

```mermaid
erDiagram
AUTHENTICATION_PROVIDERS ||--o{ USER_AUTHENTICATIONS : "has"
USERS ||--o{ USER_AUTHENTICATIONS : "has"
AUTHENTICATION_PROVIDERS {
string id PK
string name
string providerId UK
boolean enabled
string teamId FK
datetime createdAt
}
USER_AUTHENTICATIONS {
string id PK
string userId FK
string authenticationProviderId FK
blob accessToken
blob refreshToken
array scopes
string providerId UK
datetime expiresAt
datetime lastValidatedAt
}
```

**Diagram sources**
- [UserAuthentication.ts](file://server/models/UserAuthentication.ts#L25-L67)
- [AuthenticationProvider.ts](file://server/models/AuthenticationProvider.ts#L27-L88)

### OAuth Authentication Flow
The OAuth authentication flow follows the standard OAuth 2.0 authorization code grant pattern, with additional security measures including state parameter validation and token binding.

```mermaid
sequenceDiagram
participant User
participant Application
participant OAuthProvider
participant Server
User->>Application : Click provider login button
Application->>OAuthProvider : Redirect to authorization endpoint
OAuthProvider->>User : Show login prompt
User->>OAuthProvider : Enter credentials
OAuthProvider->>Application : Redirect with authorization code
Application->>Server : Exchange code for tokens
Server->>OAuthProvider : Request token exchange
OAuthProvider->>Server : Return access and refresh tokens
Server->>Server : Store tokens securely
Server-->>Application : Complete authentication
Application-->>User : Redirect to application
```

**Diagram sources**
- [passport.ts](file://server/middlewares/passport.ts#L12-L100)
- [UserAuthentication.ts](file://server/models/UserAuthentication.ts#L90-L203)

**Section sources**
- [OAuthAuthentication.ts](file://app/models/oauth/OAuthAuthentication.ts#L8-L36)
- [OAuthClient.ts](file://app/models/oauth/OAuthClient.ts#L10-L89)

## Security Considerations

### Password Hashing and Storage
The application uses industry-standard password hashing algorithms to securely store user credentials. Passwords are hashed using bcrypt with appropriate salt and iteration parameters to prevent brute-force attacks.

### Session Expiration and Management
Sessions are managed with strict expiration policies, including both absolute and sliding expiration windows. The system automatically refreshes expiring tokens when possible and invalidates sessions after periods of inactivity.

### Brute-Force Protection
The authentication system implements rate limiting and account lockout mechanisms to prevent brute-force attacks. Suspicious login attempts are monitored and appropriate actions are taken to protect user accounts.

**Section sources**
- [UserAuthentication.ts](file://server/models/UserAuthentication.ts#L90-L203)
- [authentication.ts](file://server/middlewares/authentication.ts#L158-L244)

## Frontend Integration

### AuthStore Integration
The frontend AuthStore manages authentication state across the application, providing a centralized location for user and team information.

```mermaid
classDiagram
class AuthStore {
+currentUserId : string
+currentTeamId : string
+collaborationToken : string
+availableTeams : Team[]
+lastSignedIn : string
+isSuspended : boolean
+suspendedContactEmail : string
+config : Config
+user : User
+team : Team
+policies : Policy[]
+authenticated : boolean
+asJson : PersistedData
+fetchConfig() : Promise<void>
+fetchAuth() : Promise<void>
+logout(options : LogoutOptions) : Promise<void>
}
class Config {
+name : string
+logo : string
+customTheme : CustomTheme
+hostname : string
+providers : Provider[]
}
class Provider {
+id : string
+name : string
+authUrl : string
}
AuthStore --> Config
Config --> Provider
```

**Diagram sources**
- [AuthStore.ts](file://app/stores/AuthStore.ts#L37-L362)

### Authentication State Management
The AuthStore handles authentication state across multiple tabs and windows, synchronizing state changes through localStorage events. This ensures consistent authentication state throughout the user's browsing session.

**Section sources**
- [AuthStore.ts](file://app/stores/AuthStore.ts#L1-L364)
- [RootStore.ts](file://app/stores/RootStore.ts#L39-L179)

## Common Issues

### Expired Sessions
Expired sessions occur when the authentication token has exceeded its validity period. The system automatically redirects users to the login page when session expiration is detected.

### Invalid Tokens
Invalid tokens may result from tampering, incorrect generation, or transmission errors. The authentication middleware validates token integrity and rejects requests with invalid tokens.

### Provider Misconfiguration
OAuth provider misconfiguration can prevent successful authentication. Common issues include incorrect redirect URIs, invalid client credentials, and insufficient scopes.

**Section sources**
- [authentication.ts](file://server/middlewares/authentication.ts#L178-L184)
- [passport.ts](file://server/middlewares/passport.ts#L20-L63)

## Conclusion
The baozi application provides a comprehensive and secure authentication system that supports multiple authentication methods and integrates seamlessly with frontend components. The system's modular design allows for easy extension and customization while maintaining robust security practices.

The authentication endpoints, middleware chain, and validation schemas work together to provide a reliable and secure authentication experience for users. The integration with OAuth providers and API keys enables flexible authentication options for different use cases.

By following the documented patterns and best practices, developers can effectively integrate with the authentication system and build secure applications on top of the baozi platform.