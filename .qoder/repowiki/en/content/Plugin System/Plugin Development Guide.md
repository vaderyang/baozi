# Plugin Development Guide

<cite>
**Referenced Files in This Document**   
- [plugin.json](file://plugins/azure/plugin.json)
- [client/index.tsx](file://plugins/azure/client/index.tsx)
- [server/index.ts](file://plugins/azure/server/index.ts)
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)
- [app/components/PluginIcon.tsx](file://app/components/PluginIcon.tsx)
- [app/hooks/useSettingsConfig.ts](file://app/hooks/useSettingsConfig.ts)
- [app/scenes/Settings/Import.tsx](file://app/scenes/Settings/Import.tsx)
- [server/models/helpers/AuthenticationHelper.ts](file://server/models/helpers/AuthenticationHelper.ts)
- [server/routes/api/urls/urls.ts](file://server/routes/api/urls/urls.ts)
- [server/queues/tasks/CacheIssueSourcesTask.ts](file://server/queues/tasks/CacheIssueSourcesTask.ts)
- [server/queues/processors/IntegrationDeletedProcessor.ts](file://server/queues/processors/IntegrationDeletedProcessor.ts)
- [plugins/github/server/GitHubIssueProvider.ts](file://plugins/github/server/GitHubIssueProvider.ts)
- [plugins/github/server/api/github.ts](file://plugins/github/server/api/github.ts)
- [plugins/github/client/Settings.tsx](file://plugins/github/client/Settings.tsx)
- [plugins/github/shared/GitHubUtils.ts](file://plugins/github/shared/GitHubUtils.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This guide provides comprehensive documentation for developing plugins for the baozi application. It covers the complete plugin development lifecycle, including setting up a new plugin project, implementing client and server components, registering hooks for various extension points, and following secure coding practices. The guide also includes examples of common plugin patterns, testing strategies, deployment considerations, and troubleshooting tips.

## Project Structure
The baozi application follows a modular architecture with a dedicated plugins directory for extensibility. The plugin system is designed to support both client-side (React) and server-side (Node.js) components, allowing developers to extend the application's functionality in various ways.

```mermaid
graph TB
Plugins[plugins/] --> Client[client/]
Plugins --> Server[server/]
Plugins --> Manifest[plugin.json]
Client --> Index[client/index.tsx]
Server --> Index[server/index.ts]
Client --> Components[components/]
Server --> API[api/]
Server --> Tasks[tasks/]
Server --> Auth[auth/]
```

**Diagram sources**
- [plugins/azure](file://plugins/azure)

**Section sources**
- [plugins/azure](file://plugins/azure)

## Core Components
The plugin system in baozi consists of several core components that enable extensibility. These include the PluginManager classes for both client and server, the plugin manifest file (plugin.json), and the various hook types that plugins can register for.

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

## Architecture Overview
The baozi plugin architecture is designed to be modular and extensible, with clear separation between client and server components. The system uses a hook-based registration mechanism that allows plugins to extend various aspects of the application.

```mermaid
graph LR
ClientApp[Client Application] --> ClientPluginManager[Client Plugin Manager]
ServerApp[Server Application] --> ServerPluginManager[Server Plugin Manager]
ClientPluginManager --> |Loads| ClientPlugins[Client Plugins]
ServerPluginManager --> |Loads| ServerPlugins[Server Plugins]
ClientPlugins --> |Registers| ClientHooks[Client Hooks]
ServerPlugins --> |Registers| ServerHooks[Server Hooks]
ClientHooks --> Settings[Settings]
ClientHooks --> Imports[Imports]
ClientHooks --> Icons[Icons]
ServerHooks --> API[API Endpoints]
ServerHooks --> Auth[Authentication Providers]
ServerHooks --> Email[Email Templates]
ServerHooks --> Issues[Issue Trackers]
ServerHooks --> Unfurl[Unfurl Providers]
ServerHooks --> Tasks[Background Tasks]
ServerHooks --> Processors[Message Processors]
ServerHooks --> Uninstall[Uninstall Handlers]
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

## Detailed Component Analysis

### Plugin Structure and Manifest
Each plugin in the baozi application follows a standardized directory structure and includes a manifest file (plugin.json) that defines its metadata and configuration.

```mermaid
graph TD
Plugin[Plugin Root] --> Manifest[plugin.json]
Plugin --> Client[client/]
Plugin --> Server[server/]
Manifest --> Id[ID]
Manifest --> Name[Name]
Manifest --> Description[Description]
Manifest --> Priority[Priority]
Client --> ClientIndex[client/index.tsx]
Server --> ServerIndex[server/index.ts]
```

The plugin.json file contains essential metadata about the plugin:

```json
{
  "id": "github",
  "name": "GitHub",
  "priority": 10,
  "description": "Adds a GitHub integration for link unfurling."
}
```

**Diagram sources**
- [plugins/github/plugin.json](file://plugins/github/plugin.json)

**Section sources**
- [plugins/github/plugin.json](file://plugins/github/plugin.json)

### Client-Side Plugin Implementation
Client-side plugins are implemented using React and are loaded dynamically by the client plugin manager. They can register for various client hooks to extend the user interface.

```mermaid
classDiagram
class PluginManager {
+add(plugins)
+getHooks(type)
+getHook(type, id)
+loadPlugins()
}
class Plugin {
+id : string
+type : Hook
+name : string
+description : string
+value : PluginValue
+priority : number
+deployments : string[]
}
class Hook {
+Settings : "settings"
+Imports : "imports"
+Icon : "icon"
}
class PluginValueMap {
+Settings : SettingsValue
+Imports : ImportsValue
+Icon : React.ElementType
}
class SettingsValue {
+group : string
+after : string
+icon : React.ElementType
+component : LazyComponent
+description : string
+enabled : (team, user) => boolean
}
class ImportsValue {
+title : string
+subtitle : string
+icon : React.ReactElement
+action : React.ReactElement
}
PluginManager --> Plugin : "manages"
Plugin --> Hook : "has type"
Plugin --> PluginValueMap : "has value"
PluginValueMap --> SettingsValue : "for Settings hook"
PluginValueMap --> ImportsValue : "for Imports hook"
PluginValueMap --> React.ElementType : "for Icon hook"
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)

### Server-Side Plugin Implementation
Server-side plugins are implemented using Node.js and can register for various server hooks to extend the application's backend functionality.

```mermaid
classDiagram
class PluginManager {
+add(plugins)
+getHooks(type)
+loadPlugins()
}
class Plugin {
+type : Hook
+name : string
+description : string
+value : PluginValue
+priority : number
}
class Hook {
+API : "api"
+AuthProvider : "authProvider"
+EmailTemplate : "emailTemplate"
+IssueProvider : "issueProvider"
+Processor : "processor"
+Task : "task"
+UnfurlProvider : "unfurl"
+Uninstall : "uninstall"
}
class PluginValueMap {
+API : Router
+AuthProvider : {router : Router, id : string}
+EmailTemplate : typeof BaseEmail
+IssueProvider : BaseIssueProvider
+Processor : typeof BaseProcessor
+Task : typeof BaseTask
+UnfurlProvider : {unfurl : UnfurlSignature, cacheExpiry : number}
+Uninstall : UninstallSignature
}
PluginManager --> Plugin : "manages"
Plugin --> Hook : "has type"
Plugin --> PluginValueMap : "has value"
```

**Diagram sources**
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

### Plugin Registration and Loading
The plugin system uses a two-phase loading process: first loading client plugins when the application starts, and then loading server plugins when the server initializes.

```mermaid
sequenceDiagram
participant Client as "Client App"
participant PluginManager as "PluginManager"
participant ClientPlugin as "Client Plugin"
participant Server as "Server"
participant ServerPlugin as "Server Plugin"
Client->>PluginManager : loadPlugins()
PluginManager->>PluginManager : import.meta.glob("../../plugins/*/client/index.{ts,js,tsx,jsx}")
loop For each client plugin
PluginManager->>ClientPlugin : import()
ClientPlugin->>PluginManager : PluginManager.add()
PluginManager->>PluginManager : register plugin
end
Server->>PluginManager : loadPlugins()
PluginManager->>PluginManager : glob.sync("build/plugins/*/server/!(*.test|schema).[jt]s")
loop For each server plugin
PluginManager->>ServerPlugin : require()
ServerPlugin->>PluginManager : PluginManager.add()
PluginManager->>PluginManager : register plugin
end
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

### Client Hook Types
The client plugin system supports several hook types that allow plugins to extend the user interface in different ways.

```mermaid
flowchart TD
Start([Client Plugin]) --> HookType{"Hook Type?"}
HookType --> |Settings| SettingsHook["Register settings page\n- group: string\n- icon: React.ElementType\n- component: LazyComponent\n- description: string"]
HookType --> |Imports| ImportsHook["Register import option\n- title: string\n- subtitle: string\n- icon: React.ReactElement\n- action: React.ReactElement"]
HookType --> |Icon| IconHook["Register icon\n- value: React.ElementType"]
SettingsHook --> End([Plugin Registered])
ImportsHook --> End
IconHook --> End
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)

### Server Hook Types
The server plugin system supports several hook types that allow plugins to extend the application's backend functionality.

```mermaid
flowchart TD
Start([Server Plugin]) --> HookType{"Hook Type?"}
HookType --> |API| APIHook["Register API endpoints\n- value: Router"]
HookType --> |AuthProvider| AuthProviderHook["Register authentication provider\n- value: {router: Router, id: string}"]
HookType --> |EmailTemplate| EmailTemplateHook["Register email template\n- value: typeof BaseEmail"]
HookType --> |IssueProvider| IssueProviderHook["Register issue tracker\n- value: BaseIssueProvider"]
HookType --> |Processor| ProcessorHook["Register message processor\n- value: typeof BaseProcessor"]
HookType --> |Task| TaskHook["Register background task\n- value: typeof BaseTask"]
HookType --> |UnfurlProvider| UnfurlProviderHook["Register link unfurler\n- value: {unfurl: UnfurlSignature, cacheExpiry: number}"]
HookType --> |Uninstall| UninstallHook["Register uninstall handler\n- value: UninstallSignature"]
APIHook --> End([Plugin Registered])
AuthProviderHook --> End
EmailTemplateHook --> End
IssueProviderHook --> End
ProcessorHook --> End
TaskHook --> End
UnfurlProviderHook --> End
UninstallHook --> End
```

**Diagram sources**
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

### Example: GitHub Plugin Implementation
The GitHub plugin serves as a comprehensive example of how to implement a plugin that integrates with an external service.

```mermaid
graph TD
GitHubPlugin[GitHub Plugin] --> Client[client/]
GitHubPlugin --> Server[server/]
GitHubPlugin --> Shared[shared/]
Client --> Settings[Settings.tsx]
Client --> Icon[Icon.tsx]
Client --> Index[client/index.tsx]
Server --> API[api/github.ts]
Server --> GitHub[github.ts]
Server --> Tasks[GitHubWebhookTask.ts]
Server --> Uninstall[uninstall.ts]
Server --> Index[server/index.ts]
Shared --> Utils[GitHubUtils.ts]
Shared --> Types[types.ts]
subgraph "Client Components"
Settings --> |Displays| UI[Settings UI]
Icon --> |Used in| PluginIcon[PluginIcon]
Index --> |Registers| SettingsHook[Settings Hook]
Index --> |Registers| IconHook[Icon Hook]
end
subgraph "Server Components"
API --> |Handles| OAuth[OAuth Callback]
API --> |Handles| Webhooks[Webhook Events]
GitHub --> |Provides| Unfurl[Link Unfurling]
Tasks --> |Processes| WebhookEvents[Webhook Events]
Uninstall --> |Handles| Cleanup[Cleanup on Uninstall]
Index --> |Registers| APIHook[API Hook]
Index --> |Registers| TaskHook[Task Hook]
Index --> |Registers| IssueProviderHook[Issue Provider Hook]
Index --> |Registers| UnfurlProviderHook[Unfurl Provider Hook]
Index --> |Registers| UninstallHook[Uninstall Hook]
end
```

**Diagram sources**
- [plugins/github](file://plugins/github)

**Section sources**
- [plugins/github](file://plugins/github)

### GitHub Plugin Client Implementation
The client-side implementation of the GitHub plugin registers for the Settings and Icon hooks to extend the user interface.

```mermaid
sequenceDiagram
participant Client as "Client App"
participant PluginManager as "PluginManager"
participant GitHubPlugin as "GitHub Plugin"
participant SettingsUI as "Settings UI"
participant PluginIcon as "PluginIcon"
Client->>PluginManager : loadPlugins()
PluginManager->>GitHubPlugin : import("./plugins/github/client/index.tsx")
GitHubPlugin->>PluginManager : PluginManager.add()
PluginManager->>PluginManager : register Settings hook
PluginManager->>PluginManager : register Icon hook
Client->>SettingsUI : Render settings page
SettingsUI->>PluginManager : getHooks(Hook.Settings)
PluginManager-->>SettingsUI : Return GitHub settings
SettingsUI->>GitHubPlugin : Render Settings component
Client->>PluginIcon : Render plugin icon
PluginIcon->>PluginManager : usePluginValue(Hook.Icon, "github")
PluginManager-->>PluginIcon : Return Icon component
PluginIcon->>GitHubPlugin : Render Icon
```

**Diagram sources**
- [plugins/github/client/index.tsx](file://plugins/github/client/index.tsx)
- [plugins/github/client/Settings.tsx](file://plugins/github/client/Settings.tsx)
- [app/components/PluginIcon.tsx](file://app/components/PluginIcon.tsx)

**Section sources**
- [plugins/github/client/index.tsx](file://plugins/github/client/index.tsx)
- [plugins/github/client/Settings.tsx](file://plugins/github/client/Settings.tsx)
- [app/components/PluginIcon.tsx](file://app/components/PluginIcon.tsx)

### GitHub Plugin Server Implementation
The server-side implementation of the GitHub plugin registers for multiple hooks to provide comprehensive integration with GitHub.

```mermaid
sequenceDiagram
participant Server as "Server"
participant PluginManager as "PluginManager"
participant GitHubPlugin as "GitHub Plugin"
participant GitHubAPI as "GitHub API"
participant Database as "Database"
participant Queue as "Task Queue"
Server->>PluginManager : loadPlugins()
PluginManager->>GitHubPlugin : require("./plugins/github/server/index.ts")
GitHubPlugin->>PluginManager : PluginManager.add()
PluginManager->>PluginManager : register API hook
PluginManager->>PluginManager : register Task hook
PluginManager->>PluginManager : register IssueProvider hook
PluginManager->>PluginManager : register UnfurlProvider hook
PluginManager->>PluginManager : register Uninstall hook
Server->>GitHubAPI : Handle OAuth callback
GitHubAPI->>Database : Store authentication
GitHubAPI->>Database : Create integration
Server->>GitHubAPI : Receive webhook
GitHubAPI->>Queue : Schedule GitHubWebhookTask
Queue->>GitHubPlugin : Execute GitHubWebhookTask
GitHubPlugin->>Database : Update integration data
Server->>GitHubPlugin : Request issue sources
GitHubPlugin->>GitHubAPI : Fetch repositories
GitHubAPI-->>GitHubPlugin : Return repositories
GitHubPlugin-->>Server : Return issue sources
Server->>GitHubPlugin : Request link unfurl
GitHubPlugin->>GitHubAPI : Fetch issue/PR data
GitHubAPI-->>GitHubPlugin : Return issue/PR data
GitHubPlugin-->>Server : Return unfurled content
Server->>GitHubPlugin : Uninstall integration
GitHubPlugin->>GitHubAPI : Cleanup GitHub resources
GitHubPlugin->>Database : Remove integration data
```

**Diagram sources**
- [plugins/github/server/index.ts](file://plugins/github/server/index.ts)
- [plugins/github/server/api/github.ts](file://plugins/github/server/api/github.ts)
- [plugins/github/server/GitHubIssueProvider.ts](file://plugins/github/server/GitHubIssueProvider.ts)

**Section sources**
- [plugins/github/server/index.ts](file://plugins/github/server/index.ts)
- [plugins/github/server/api/github.ts](file://plugins/github/server/api/github.ts)
- [plugins/github/server/GitHubIssueProvider.ts](file://plugins/github/server/GitHubIssueProvider.ts)

## Dependency Analysis
The plugin system in baozi has a well-defined dependency structure that ensures plugins are loaded and initialized correctly.

```mermaid
graph TD
App[Application] --> ClientPluginManager[Client Plugin Manager]
App --> ServerPluginManager[Server Plugin Manager]
ClientPluginManager --> PluginManagerBase[PluginManager Base]
ServerPluginManager --> PluginManagerBase
PluginManagerBase --> Observable[mobx: observable]
PluginManagerBase --> Lodash[lodash: isArray, sortBy]
PluginManagerBase --> Logger[Logger]
ClientPluginManager --> React[React]
ClientPluginManager --> MobxReact[mobx-react]
ClientPluginManager --> StyledComponents[styled-components]
ServerPluginManager --> KoaRouter[koa-router]
ServerPluginManager --> Glob[glob]
ServerPluginManager --> Logger[Logger]
subgraph "Client Plugins"
GitHubClient[GitHub Client Plugin] --> ClientPluginManager
SlackClient[Slack Client Plugin] --> ClientPluginManager
DiscordClient[Discord Client Plugin] --> ClientPluginManager
end
subgraph "Server Plugins"
GitHubServer[GitHub Server Plugin] --> ServerPluginManager
SlackServer[Slack Server Plugin] --> ServerPluginManager
DiscordServer[Discord Server Plugin] --> ServerPluginManager
end
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

## Performance Considerations
The plugin system is designed with performance in mind, using lazy loading and efficient registration mechanisms to minimize startup time and memory usage.

```mermaid
flowchart TD
Start([Application Start]) --> LoadClientPlugins["Load client plugins\n(import.meta.glob)"]
LoadClientPlugins --> LazyLoad["Lazy load plugin components\n(only when needed)"]
LazyLoad --> End1([Optimal Client Performance])
Start --> LoadServerPlugins["Load server plugins\n(glob.sync + require)"]
LoadServerPlugins --> RegisterHooks["Register hooks immediately"]
RegisterHooks --> LazyInit["Initialize plugin logic\n(only when first used)"]
LazyInit --> End2([Optimal Server Performance])
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

## Troubleshooting Guide
This section provides guidance for common issues encountered during plugin development.

```mermaid
flowchart TD
Problem{"Issue?"}
Problem --> |Plugin not loading| NotLoading["Check:\n- plugin.json exists\n- client/index.tsx or server/index.ts exists\n- correct file paths\n- no syntax errors"]
Problem --> |Hook not registering| NotRegistering["Check:\n- correct Hook type\n- PluginManager.add() called\n- plugin enabled for deployment\n- no errors in console/logs"]
Problem --> |Client component not rendering| NotRendering["Check:\n- lazy component correctly defined\n- component path correct\n- no React errors\n- plugin priority not too low"]
Problem --> |Server API not accessible| APIIssue["Check:\n- router correctly exported\n- routes properly defined\n- authentication middleware if needed\n- server restarted after changes"]
Problem --> |Environment variables missing| EnvVars["Check:\n- required env vars defined\n- env.ts file exists and exports vars\n- vars available in runtime environment"]
NotLoading --> Solution1["Fix file structure or syntax"]
NotRegistering --> Solution2["Verify registration code"]
NotRendering --> Solution3["Check component implementation"]
APIIssue --> Solution4["Verify API routes and middleware"]
EnvVars --> Solution5["Define required environment variables"]
```

**Diagram sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

**Section sources**
- [app/utils/PluginManager.ts](file://app/utils/PluginManager.ts)
- [server/utils/PluginManager.ts](file://server/utils/PluginManager.ts)

## Conclusion
The baozi plugin system provides a robust and flexible framework for extending the application's functionality. By following the patterns and practices outlined in this guide, developers can create plugins that seamlessly integrate with the core application, providing valuable features to users. The clear separation between client and server components, combined with the hook-based registration system, makes it easy to develop, test, and deploy plugins that enhance the baozi experience.