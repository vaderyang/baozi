# Webhook管理

<cite>
**本文档中引用的文件**
- [WebhookSubscription.ts](file://app/models/WebhookSubscription.ts)
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts)
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts)
- [CleanupWebhookDeliveriesTask.ts](file://plugins/webhooks/server/tasks/CleanupWebhookDeliveriesTask.ts)
- [validateWebhook.ts](file://server/middlewares/validateWebhook.ts)
- [webhookSubscriptions.ts](file://plugins/webhooks/server/api/webhookSubscriptions.ts)
- [webhookSubscription.ts](file://plugins/webhooks/server/presenters/webhookSubscription.ts)
- [webhook.ts](file://plugins/webhooks/server/presenters/webhook.ts)
- [WebhookDelivery.ts](file://server/models/WebhookDelivery.ts)
</cite>

## 目录
1. [简介](#简介)
2. [Webhook订阅数据结构](#webhook订阅数据结构)
3. [事件推送机制](#事件推送机制)
4. [端点管理](#端点管理)
5. [签名机制与安全性](#签名机制与安全性)
6. [重试策略与失败处理](#重试策略与失败处理)
7. [过期记录清理](#过期记录清理)
8. [事件类型与过滤](#事件类型与过滤)
9. [错误处理与调试](#错误处理与调试)
10. [实际应用示例](#实际应用示例)

## 简介
Webhook系统为应用程序提供了实时通知机制，当系统内发生特定事件时，会向预配置的URL发送HTTP请求。本系统实现了完整的Webhook订阅管理、事件推送、签名验证和失败处理机制。核心功能包括创建和管理Webhook订阅、处理各种事件类型、确保通信安全以及维护系统性能。

**Section sources**
- [WebhookSubscription.ts](file://app/models/WebhookSubscription.ts#L4-L26)
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L30-L164)

## Webhook订阅数据结构
Webhook订阅模型定义了订阅的核心属性和行为。该模型在客户端和服务器端都有定义，确保了数据的一致性。

```mermaid
classDiagram
class WebhookSubscription {
+string name
+string url
+string secret
+boolean enabled
+string[] events
+string createdById
+string teamId
+Date createdAt
+Date updatedAt
+rotateSecret() void
+disable() Promise~WebhookSubscription~
+validForEvent(event) boolean
+signature(payload) string
}
WebhookSubscription --> Team : "belongs to"
WebhookSubscription --> User : "created by"
```

**Diagram sources**
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L30-L164)

**Section sources**
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L30-L164)

## 事件推送机制
事件推送由`DeliverWebhookTask`类处理，该类负责将事件交付给订阅的Webhook端点。系统采用异步任务队列模式，确保事件处理不会阻塞主应用流程。

```mermaid
sequenceDiagram
participant Event as 事件系统
participant Task as DeliverWebhookTask
participant Webhook as Webhook端点
participant DB as 数据库
Event->>Task : 触发事件 (documents.create)
Task->>DB : 查找活动订阅
DB-->>Task : 返回订阅列表
loop 每个匹配的订阅
Task->>Task : 构建有效载荷
Task->>Task : 生成签名
Task->>Webhook : POST /webhook-endpoint
Webhook-->>Task : HTTP响应
Task->>DB : 记录交付状态
end
```

**Diagram sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L81-L842)

**Section sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L81-L842)

## 端点管理
Webhook订阅通过REST API端点进行管理，支持创建、读取、更新和删除操作。所有端点都需要管理员权限认证。

```mermaid
flowchart TD
A[客户端请求] --> B{认证检查}
B --> |通过| C[权限验证]
B --> |失败| Z[返回401]
C --> |有权限| D[执行操作]
C --> |无权限| Y[返回403]
D --> E[数据库事务]
E --> F[返回响应]
subgraph "创建订阅"
D --> D1[验证输入]
D1 --> D2[检查订阅限制]
D2 --> D3[创建订阅记录]
end
subgraph "更新订阅"
D --> D4[查找订阅]
D4 --> D5[验证所有权]
D5 --> D6[更新字段]
end
subgraph "删除订阅"
D --> D7[查找订阅]
D7 --> D8[验证权限]
D8 --> D9[软删除记录]
end
```

**Diagram sources**
- [webhookSubscriptions.ts](file://plugins/webhooks/server/api/webhookSubscriptions.ts#L25-L136)

**Section sources**
- [webhookSubscriptions.ts](file://plugins/webhooks/server/api/webhookSubscriptions.ts#L25-L136)

## 签名机制与安全性
系统实现了基于HMAC的签名验证机制，确保Webhook请求的真实性和完整性。签名包含时间戳和签名值，防止重放攻击。

```mermaid
sequenceDiagram
participant Server as 服务器
participant Client as 客户端
Server->>Server : payload = JSON.stringify(data)
Server->>Server : timestamp = Date.now()
Server->>Server : signature = HMAC-SHA256(secret, `${timestamp}.${payload}`)
Server->>Client : POST /webhook
Server->>Client : Outline-Signature : t=timestamp,s=signature
Client->>Client : 验证签名
Client->>Client : 检查时间戳防重放
Client-->>Server : 响应结果
```

**Diagram sources**
- [validateWebhook.ts](file://server/middlewares/validateWebhook.ts#L0-L36)
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L145-L164)

**Section sources**
- [validateWebhook.ts](file://server/middlewares/validateWebhook.ts#L0-L36)
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L145-L164)

## 重试策略与失败处理
系统实现了智能的失败检测和处理机制。当Webhook交付连续失败时，系统会自动禁用订阅并通知创建者。

```mermaid
flowchart TD
A[交付失败] --> B{分析失败率}
B --> |失败率 < 阈值| C[记录失败]
B --> |失败率 >= 阈值| D[禁用订阅]
D --> E[发送通知邮件]
E --> F[记录操作日志]
G[成功交付] --> H[重置失败计数]
I[定期检查] --> J{检查最近交付}
J --> |有失败| K[计算失败率]
J --> |无失败| L[无需操作]
```

**Diagram sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L763-L841)

**Section sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L763-L841)

## 过期记录清理
系统定期清理过期的Webhook交付记录，保持数据库性能和存储效率。

```mermaid
flowchart TD
A[Cron作业每日执行] --> B[查找7天前的记录]
B --> C{找到记录?}
C --> |是| D[批量删除记录]
C --> |否| E[无需操作]
D --> F[记录删除数量]
F --> G[完成清理]
```

**Diagram sources**
- [CleanupWebhookDeliveriesTask.ts](file://plugins/webhooks/server/tasks/CleanupWebhookDeliveriesTask.ts#L9-L32)

**Section sources**
- [CleanupWebhookDeliveriesTask.ts](file://plugins/webhooks/server/tasks/CleanupWebhookDeliveriesTask.ts#L9-L32)

## 事件类型与过滤
系统支持多种事件类型，并允许订阅者通过事件过滤器精确控制接收的事件。

```mermaid
classDiagram
class Event {
+string name
+string actorId
+string teamId
+Date createdAt
+Record~string, any~ data
}
class WebhookSubscription {
+string[] events
+validForEvent(event) boolean
}
class DocumentEvent {
+string documentId
+string collectionId
}
class UserEvent {
+string userId
}
class CommentEvent {
+string commentId
+string documentId
}
Event <|-- DocumentEvent
Event <|-- UserEvent
Event <|-- CommentEvent
WebhookSubscription --> Event : "过滤"
```

**Diagram sources**
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L122-L135)
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L100-L250)

**Section sources**
- [WebhookSubscription.ts](file://server/models/WebhookSubscription.ts#L122-L135)
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L100-L250)

## 错误处理与调试
系统提供了全面的错误处理和调试支持，包括详细的日志记录和交付状态跟踪。

```mermaid
classDiagram
class WebhookDelivery {
+WebhookDeliveryStatus status
+number statusCode
+unknown requestBody
+Record~string, string~ requestHeaders
+string responseBody
+Record~string, string~ responseHeaders
+Date createdAt
}
class WebhookDeliveryStatus {
<<enumeration>>
pending
success
failed
}
WebhookDelivery --> WebhookDeliveryStatus : "状态"
WebhookDelivery --> WebhookSubscription : "属于"
```

**Diagram sources**
- [WebhookDelivery.ts](file://server/models/WebhookDelivery.ts#L15-L55)

**Section sources**
- [WebhookDelivery.ts](file://server/models/WebhookDelivery.ts#L15-L55)

## 实际应用示例
以下是处理文档创建和评论添加事件的实际示例：

```mermaid
flowchart LR
A[文档创建] --> B[触发documents.create事件]
B --> C[查找匹配的Webhook订阅]
C --> D{订阅是否启用?}
D --> |是| E[构建文档有效载荷]
D --> |否| F[跳过]
E --> G[生成签名]
G --> H[发送POST请求]
H --> I{响应成功?}
I --> |是| J[记录成功交付]
I --> |否| K[记录失败并分析]
L[评论添加] --> M[触发comments.create事件]
M --> N[查找匹配的Webhook订阅]
N --> O{订阅是否启用?}
O --> |是| P[构建评论有效载荷]
O --> |否| Q[跳过]
P --> R[生成签名]
R --> S[发送POST请求]
S --> T{响应成功?}
T --> |是| U[记录成功交付]
T --> |否| V[记录失败并分析]
```

**Diagram sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L252-L383)
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L385-L443)

**Section sources**
- [DeliverWebhookTask.ts](file://plugins/webhooks/server/tasks/DeliverWebhookTask.ts#L252-L443)