# API密钥管理

<cite>
**本文档中引用的文件**  
- [ApiKey.ts](file://app/models/ApiKey.ts)
- [ApiKey.ts](file://server/models/ApiKey.ts)
- [20160824061730-add-apikeys.js](file://server/migrations/20160824061730-add-apikeys.js)
- [20240929194201-add-hash-to-api-key.js](file://server/migrations/20240929194201-add-hash-to-api-key.js)
- [20250125031823-add-api-key-scopes.js](file://server/migrations/20250125031823-add-api-key-scopes.js)
- [20240617030911-add-apikey-expiry.js](file://server/migrations/20240617030911-add-apikey-expiry.js)
- [20240618201908-add-lastActiveAt-to-apikey.js](file://server/migrations/20240618201908-add-lastActiveAt-to-apikey.js)
- [apiKey.ts](file://server/presenters/apiKey.ts)
</cite>

## 目录
1. [简介](#简介)
2. [API密钥模型定义](#api密钥模型定义)
3. [字段说明](#字段说明)
4. [presentApiKey函数解析](#presentapikey函数解析)
5. [数据库迁移分析](#数据库迁移分析)
6. [API端点使用示例](#api端点使用示例)
7. [前端组件展示](#前端组件展示)
8. [安全机制与最佳实践](#安全机制与最佳实践)

## 简介
本文档详细说明了系统中API密钥的管理机制，涵盖密钥的创建、撤销、权限范围控制和安全机制。基于`ApiKey`模型，深入解析其字段定义、数据转换逻辑、数据库迁移过程以及前后端集成方式，为开发者和管理员提供完整的API密钥管理指南。

## API密钥模型定义

API密钥模型在前后端分别定义，确保类型安全和数据一致性。前端模型位于`app/models/ApiKey.ts`，后端模型位于`server/models/ApiKey.ts`，两者结构保持同步。

**Section sources**
- [ApiKey.ts](file://app/models/ApiKey.ts#L1-L58)
- [ApiKey.ts](file://server/models/ApiKey.ts#L1-L182)

## 字段说明

API密钥包含多个关键属性，用于标识、验证和控制访问权限。

### 核心字段
- **id**: 密钥的唯一标识符
- **name**: 密钥的可读名称，便于用户识别
- **value**: 密钥的明文值，仅在创建时可用
- **last4**: 密钥最后四位字符的预览，用于安全显示
- **scope**: 密钥的权限范围数组，控制可访问的资源路径
- **expiresAt**: 密钥的过期时间，可选字段
- **lastActiveAt**: 密钥最后使用时间戳

### 计算属性
- **isExpired**: 基于`expiresAt`判断密钥是否已过期
- **obfuscatedValue**: 模糊化的密钥值，根据创建时间返回不同格式的隐藏值

**Section sources**
- [ApiKey.ts](file://app/models/ApiKey.ts#L1-L58)

## presentApiKey函数解析

`presentApiKey`函数负责将数据库中的API密钥模型转换为API响应格式。该函数位于`server/presenters/apiKey.ts`，确保输出的数据结构符合前端需求。

函数将`ApiKey`实例转换为包含以下字段的对象：
- id
- user（通过`presentUser`函数处理）
- userId
- name
- scope
- value
- last4
- createdAt
- updatedAt
- expiresAt
- lastActiveAt

此转换过程确保敏感信息的安全处理和数据的一致性输出。

**Section sources**
- [apiKey.ts](file://server/presenters/apiKey.ts#L3-L17)

## 数据库迁移分析

### 初始迁移
`20160824061730-add-apikeys.js`创建了初始的`apiKeys`表，包含基本字段如`id`、`name`、`secret`、`userId`等。

### 哈希化迁移
`20240929194201-add-hash-to-api-key.js`是关键的安全升级迁移：
- 添加`hash`字段存储密钥的哈希值
- 添加`last4`字段存储密钥末四位
- 将`secret`字段改为可为空，为后续完全移除做准备

### 权限范围迁移
`20250125031823-add-api-key-scopes.js`添加了`scope`字段：
- 类型为字符串数组
- 用于定义密钥的访问权限范围
- 允许空值，表示完全访问权限

### 过期与活跃时间迁移
- `20240617030911-add-apikey-expiry.js`添加`expiresAt`字段支持密钥过期功能
- `20240618201908-add-lastActiveAt-to-apikey.js`添加`lastActiveAt`字段跟踪密钥使用情况

**Section sources**
- [20160824061730-add-apikeys.js](file://server/migrations/20160824061730-add-apikeys.js#L1-L40)
- [20240929194201-add-hash-to-api-key.js](file://server/migrations/20240929194201-add-hash-to-api-key.js#L1-L55)
- [20250125031823-add-api-key-scopes.js](file://server/migrations/20250125031823-add-api-key-scopes.js#L1-L24)
- [20240617030911-add-apikey-expiry.js](file://server/migrations/20240617030911-add-apikey-expiry.js)
- [20240618201908-add-lastActiveAt-to-apikey.js](file://server/migrations/20240618201908-add-lastActiveAt-to-apikey.js)

## API端点使用示例

### 创建带作用域和过期时间的密钥
```json
POST /api/apiKeys
{
  "name": "My Integration Key",
  "scope": ["documents:read", "collections:write"],
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

### 安全复制密钥
创建后，系统返回完整密钥值，前端应：
1. 立即提示用户复制密钥
2. 显示模糊化的密钥值（如`ol...abcd`）
3. 提供复制按钮，但仅允许一次性复制
4. 密钥值不会在后续API调用中返回

### 管理操作
- **撤销密钥**: DELETE /api/apiKeys/:id
- **更新密钥**: PATCH /api/apiKeys/:id（可更新名称、作用域、过期时间）
- **列出密钥**: GET /api/apiKeys

**Section sources**
- [ApiKey.ts](file://server/models/ApiKey.ts#L1-L182)

## 前端组件展示

`ApiKeyListItem`组件负责在用户界面中展示密钥信息并提供操作菜单。该组件基于`app/models/ApiKey.ts`中的模型定义，显示以下信息：
- 密钥名称
- 模糊化的密钥值（使用`obfuscatedValue`计算属性）
- 创建时间
- 过期时间（如果设置）
- 最后使用时间
- 状态指示器（是否过期）

操作菜单提供：
- 复制密钥值
- 编辑密钥（修改名称、作用域、过期时间）
- 撤销密钥

**Section sources**
- [ApiKey.ts](file://app/models/ApiKey.ts#L1-L58)

## 安全机制与最佳实践

### 安全机制
1. **哈希存储**: 密钥以哈希形式存储，原始值仅在创建时短暂存在
2. **作用域控制**: 通过`scope`字段实现细粒度权限控制
3. **过期机制**: 支持设置密钥有效期，自动失效
4. **活跃追踪**: 记录最后使用时间，便于审计和监控

### 最佳实践
- **最小权限原则**: 为每个集成创建具有最小必要权限的密钥
- **定期轮换**: 设置合理的过期时间并定期轮换密钥
- **监控使用**: 通过`lastActiveAt`监控密钥使用情况
- **立即撤销**: 不再需要的密钥应立即撤销
- **安全存储**: 客户端收到密钥后应安全存储，避免日志记录

**Section sources**
- [ApiKey.ts](file://server/models/ApiKey.ts#L1-L182)
- [ApiKey.ts](file://app/models/ApiKey.ts#L1-L58)