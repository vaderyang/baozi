# 上下文图（Context Map）

本文档描述了Outline知识管理平台中各个限界上下文（Bounded Context）之间的关系与协作方式，基于领域驱动设计的战术模式，为系统架构和集成设计提供指导。

## 目录

- [概述](#概述)
- [限界上下文识别](#限界上下文识别)
- [上下文关系模式](#上下文关系模式)
- [集成架构图](#集成架构图)
- [数据流与协作机制](#数据流与协作机制)
- [演进与重构指南](#演进与重构指南)

## 概述

### 上下文图作用
上下文图帮助我们：
1. **明确边界**：定义每个限界上下文的职责范围
2. **识别集成点**：确定上下文间的数据交换和依赖关系
3. **选择集成模式**：根据业务关系选择合适的技术实现方式
4. **指导重构**：为系统演进和模块拆分提供参考

### 关系模式说明
- **合作关系（Partnership）**：两个上下文为了共同目标密切协作
- **共享内核（Shared Kernel）**：两个上下文共享部分领域模型
- **客户-供应商（Customer-Supplier）**：下游依赖上游，上游满足下游需求
- **遵循者（Conformist）**：下游完全依赖上游，无法影响上游
- **防腐层（Anticorruption Layer）**：通过转换层隔离外部系统的影响
- **开放主机服务（Open Host Service）**：提供标准化的服务接口
- **大泥球（Big Ball of Mud）**：缺乏清晰边界的混乱系统部分

## 限界上下文识别

基于对Outline业务和代码的分析，识别出以下限界上下文：

### 1. 文档编辑上下文（Document Editing Context）
**职责范围**：
- 富文本编辑器的核心功能
- 文档内容的创建、编辑、格式化
- 实时协作编辑和冲突解决
- 文档版本管理和历史追踪

**核心模型**：
- Document（文档实体）
- Revision（版本实体）  
- EditOperation（编辑操作）
- CollaborationSession（协作会话）

**技术边界**：
- `shared/editor/` - 编辑器组件
- `server/models/Document.ts` - 文档模型
- `server/models/Revision.ts` - 版本模型
- WebSocket协作基础设施

### 2. 知识组织上下文（Knowledge Organization Context）
**职责范围**：
- Collection和Document的层次结构管理
- 知识分类和标签系统
- 文档间的关联关系维护
- 知识图谱和反向链接构建

**核心模型**：
- Collection（知识集合）
- DocumentHierarchy（文档层次）
- Tag（标签）
- Backlink（反向链接）

**技术边界**：
- `server/models/Collection.ts` - 集合模型
- 文档关系和层次管理逻辑
- 标签和分类系统

### 3. 搜索与发现上下文（Search & Discovery Context）
**职责范围**：
- 全文搜索和索引管理
- 搜索结果排序和个性化
- 内容推荐和相关性计算
- 搜索分析和优化

**核心模型**：
- SearchIndex（搜索索引）
- SearchQuery（搜索查询）
- SearchResult（搜索结果）
- RecommendationEngine（推荐引擎）

**技术边界**：
- 搜索引擎集成（Elasticsearch等）
- 搜索算法和排序逻辑
- 推荐算法实现

### 4. 用户管理上下文（User Management Context）
**职责范围**：
- 用户身份管理和认证
- 用户Profile和偏好设置
- 团队和组织结构管理
- 用户生命周期管理

**核心模型**：
- User（用户实体）
- Team（团队实体）
- UserProfile（用户档案）
- Organization（组织结构）

**技术边界**：
- `server/models/User.ts` - 用户模型
- `server/models/Team.ts` - 团队模型
- 认证和会话管理

### 5. 权限控制上下文（Permission Control Context）
**职责范围**：
- 基于角色的访问控制（RBAC）
- 资源权限的精细管控
- 权限继承和传播机制
- 安全策略的执行和审计

**核心模型**：
- Permission（权限实体）
- Role（角色实体）
- PolicyRule（策略规则）
- AccessControl（访问控制）

**技术边界**：
- `server/policies/` - 权限策略
- `server/models/UserMembership.ts` - 用户权限
- `server/models/GroupMembership.ts` - 群组权限

### 6. 协作与社交上下文（Collaboration & Social Context）
**职责范围**：
- 评论和讨论功能
- 用户互动和反馈机制
- 实时在线状态和通知
- 社交功能和用户参与

**核心模型**：
- Comment（评论实体）
- Reaction（反应实体）
- Mention（提及实体）
- UserPresence（用户状态）

**技术边界**：
- `server/models/Comment.ts` - 评论模型
- `server/models/Reaction.ts` - 反应模型
- 实时通信基础设施

### 7. 集成与API上下文（Integration & API Context）
**职责范围**：
- 第三方系统集成
- API网关和接口管理
- Webhook事件分发
- 数据同步和迁移

**核心模型**：
- Integration（集成实体）
- APIKey（API密钥）
- WebhookSubscription（Webhook订阅）
- ExternalService（外部服务）

**技术边界**：
- `server/models/Integration.ts` - 集成模型
- `server/models/ApiKey.ts` - API密钥管理
- `server/models/WebhookSubscription.ts` - Webhook管理

### 8. 通知与消息上下文（Notification & Messaging Context）
**职责范围**：
- 系统通知的生成和分发
- 邮件和消息模板管理
- 通知偏好和订阅管理
- 消息队列和异步处理

**核心模型**：
- Notification（通知实体）
- NotificationTemplate（通知模板）
- Subscription（订阅实体）
- MessageQueue（消息队列）

**技术边界**：
- `server/models/Notification.ts` - 通知模型
- `server/models/Subscription.ts` - 订阅模型
- `server/emails/` - 邮件模板系统

## 上下文关系模式

### 合作关系（Partnership）

#### 文档编辑 ↔ 知识组织
**关系性质**：密切合作，共同实现知识创作和组织的核心价值
**协作机制**：
- 文档创建时自动更新知识组织结构
- 文档移动和重命名时同步更新层次关系
- 共同维护文档的分类和标签信息

**技术实现**：
```javascript
// 文档编辑触发知识组织更新
class DocumentService {
  async updateDocument(docId, changes) {
    await this.documentRepository.update(docId, changes);
    // 合作关系：同步更新知识组织
    await this.knowledgeOrganizer.updateDocumentHierarchy(docId, changes);
  }
}
```

#### 协作与社交 ↔ 通知与消息
**关系性质**：协作功能的使用触发通知系统的消息分发
**协作机制**：
- 评论和反应触发相关用户通知
- @提及功能触发实时和邮件通知
- 协作状态变化触发订阅者通知

### 客户-供应商关系（Customer-Supplier）

#### 搜索与发现 ← 文档编辑（供应商）
**关系性质**：搜索依赖文档内容，文档编辑为搜索提供数据源
**供应合约**：
- 文档内容变更时提供索引更新事件
- 提供结构化的文档元数据
- 保证文档状态变化的及时通知

**技术实现**：
```javascript
// 文档编辑作为供应商，为搜索提供数据
class DocumentEditingService {
  async saveDocument(document) {
    await this.repository.save(document);
    // 供应商职责：通知搜索系统更新索引
    await this.eventPublisher.publish('document.updated', {
      documentId: document.id,
      content: document.content,
      metadata: document.extractMetadata()
    });
  }
}

// 搜索作为客户，消费文档数据
class SearchService {
  constructor() {
    this.eventSubscriber.subscribe('document.updated', this.updateIndex.bind(this));
  }
}
```

#### 权限控制 ← 用户管理（供应商）
**关系性质**：权限控制依赖用户管理提供的身份和组织信息
**供应合约**：
- 提供用户身份验证结果
- 提供用户角色和群组归属信息
- 提供组织结构和层次关系数据

### 开放主机服务（Open Host Service）

#### 集成与API → 外部系统
**服务性质**：为外部系统提供标准化的API接口
**服务契约**：
- RESTful API和GraphQL接口
- 标准化的认证和鉴权机制
- 版本化的接口和向后兼容保证
- 完整的API文档和SDK支持

**技术实现**：
```javascript
// 开放主机服务：标准化API接口
class PublicAPIService {
  // 标准化的文档操作接口
  async getDocuments(query, context) {
    // 统一的权限检查
    await this.permissionService.authorize(context.user, 'documents.read');
    // 标准化的数据格式
    return this.documentService.search(query).map(this.transformToPublicFormat);
  }
  
  // 统一的错误处理和响应格式
  transformToPublicFormat(document) {
    return {
      id: document.id,
      title: document.title,
      updatedAt: document.updatedAt.toISOString(),
      // 隐藏内部实现细节
    };
  }
}
```

### 防腐层（Anticorruption Layer）

#### 集成与API ← 外部服务（如Slack、Notion）
**防腐目的**：隔离外部系统的数据模型和接口变化，保护内部领域模型
**转换机制**：
- 外部数据模型到内部模型的映射
- 外部API调用的封装和重试逻辑
- 外部系统错误的转换和处理

**技术实现**：
```javascript
// 防腐层：隔离Notion API的变化
class NotionIntegrationACL {
  constructor(notionAPI, documentService) {
    this.notionAPI = notionAPI;
    this.documentService = documentService;
  }
  
  // 防腐层：转换外部模型到内部模型
  async importNotionPage(notionPageId) {
    try {
      // 调用外部API
      const notionPage = await this.notionAPI.getPage(notionPageId);
      
      // 防腐转换：Notion数据结构 -> 内部文档模型
      const internalDocument = this.transformNotionToDocument(notionPage);
      
      return await this.documentService.createDocument(internalDocument);
    } catch (externalError) {
      // 防腐层：转换外部错误到内部错误
      throw this.transformExternalError(externalError);
    }
  }
  
  private transformNotionToDocument(notionPage) {
    return {
      title: notionPage.properties.title.title[0]?.plain_text || 'Untitled',
      content: this.convertNotionBlocksToOurFormat(notionPage.blocks),
      metadata: {
        source: 'notion',
        externalId: notionPage.id,
        importedAt: new Date()
      }
    };
  }
}
```

### 共享内核（Shared Kernel）

#### 用户管理 ↔ 权限控制
**共享范围**：用户身份和基础角色模型
**共享内容**：
- User实体的基础定义
- 核心角色枚举（Admin、Member、Viewer、Guest）
- 基础的身份验证接口

**协作约定**：
- 共享模型的变更需要两个团队共同决定
- 共享代码库的维护责任共担
- 向后兼容性保证

### 遵循者（Conformist）

#### 通知与消息 ← 外部邮件服务（SendGrid/AWS SES）
**遵循性质**：完全依赖外部邮件服务的API和数据格式
**适配策略**：
- 严格按照外部服务的API规范构建集成
- 接受外部服务的数据模型和限制
- 在外部服务变更时及时跟进适配

## 集成架构图

```
                    Outline 上下文集成架构图
    
┌─────────────────────────────────────────────────────────────────┐
│                          Web前端                                 │
│                    (React + MobX)                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/WebSocket
┌───────────────────────────┴─────────────────────────────────────┐
│                      API网关层                                  │
│                (GraphQL + REST)                                │
└─────────────┬─────────────┬─────────────┬─────────────┬─────────┘
              │             │             │             │
┌─────────────┴───┐   ┌─────┴─────┐  ┌────┴─────┐  ┌───┴─────┐
│   文档编辑      │───│ 知识组织   │  │搜索与发现 │  │协作社交  │
│   上下文       │   │  上下文    │  │  上下文  │  │ 上下文   │
│               │   │           │  │         │  │         │
│ ┌─Document────┤   │ ┌Collection┤  │ ┌Search──┤  │ ┌Comment│
│ ├─Revision────┤   │ ├Tag──────┤  │ ├Index───┤  │ ├Reaction│
│ └─Collaboration   │ └Backlink──┤  │ └Recommend │ └Mention─┘
└─────────────┬───┘   └───────────┘  └─────┬───┘  └─────┬───┘
              │                           │            │
              │ 合作关系                   │ 客户关系    │
              └─────────┬─────────────────┘            │
                       │                              │
┌─────────────────────┴────────────────────────────────┴─────────┐
│                     事件总线                                   │
│              (内部消息队列 + 事件发布订阅)                       │
└─────┬─────────┬─────────────┬─────────────┬─────────────┬─────┘
      │         │             │             │             │
┌─────┴───┐ ┌───┴─────┐  ┌────┴─────┐  ┌───┴─────┐  ┌───┴─────┐
│用户管理  │ │权限控制  │  │通知消息   │  │集成API   │  │外部服务  │
│上下文   │ │上下文   │  │上下文    │  │上下文    │  │        │
│        │ │        │  │         │  │         │  │         │
│┌User───┤ │┌Permission │ ┌Notification │ ┌Integration │ ┌Slack──│
│├Team───┤ │├Role──────┤  ├Template──┤  ├APIKey────┤  ├Notion──│  
│└Group──┘ │└Policy────┘  └Subscription└WebhookSubscr └Email───┘
└─────┬───┘ └─────┬─────┘  └─────────────┘  └─────────┘  └─────────┘
      │           │                        
      └──共享内核──┘                        防腐层        遵循者
      
```

## 数据流与协作机制

### 1. 文档创作流程
```
用户创作请求 → 文档编辑上下文 → [合作] 知识组织上下文 → [客户] 搜索发现上下文
                  ↓
            [合作] 协作社交上下文 → [合作] 通知消息上下文
```

**数据流详述**：
1. 用户在编辑器中创建/修改文档
2. 文档编辑上下文保存文档内容和版本
3. 知识组织上下文更新文档层次和关联关系
4. 搜索发现上下文更新全文索引和推荐模型
5. 协作社交上下文记录用户活动和互动
6. 通知消息上下文向相关用户发送更新通知

### 2. 权限检查流程
```
API请求 → 权限控制上下文 ←[共享内核]→ 用户管理上下文
             ↓
        策略执行结果 → 业务上下文（文档编辑/知识组织等）
```

### 3. 第三方集成流程
```
外部系统 → [防腐层] 集成API上下文 → 相关业务上下文
           ↓
     [开放主机] API接口 ← 外部系统请求
```

### 4. 搜索与推荐流程
```
搜索请求 → 搜索发现上下文 → [客户] 文档编辑上下文（获取权限相关数据）
             ↓                    ↓
        权限过滤 ← [客户] 权限控制上下文
             ↓
        搜索结果返回
```

## 演进与重构指南

### 当前架构问题识别

#### 1. 大泥球区域（Big Ball of Mud）
**识别特征**：
- `server/models/` 中某些模型职责不清晰
- 跨多个上下文的业务逻辑混杂
- 循环依赖和紧耦合问题

**重构建议**：
- 将复合职责的模型拆分到对应上下文
- 引入领域事件解耦上下文间的直接调用
- 建立清晰的接口边界

#### 2. 过度耦合的集成点
**问题描述**：某些上下文之间存在过于紧密的数据库层面耦合

**解决方案**：
- 引入事件驱动架构减少同步依赖
- 实现数据的最终一致性模型
- 考虑微服务架构的逐步演进

### 微服务演进路径

#### 第一阶段：模块化重构（当前-6个月）
- 在现有单体架构内明确上下文边界
- 引入领域事件和消息总线
- 重构混乱的依赖关系

#### 第二阶段：服务拆分（6-12个月）
- 将搜索与发现上下文独立为服务
- 将集成与API上下文独立为服务  
- 保持核心编辑功能在单体内

#### 第三阶段：完整微服务架构（12个月+）
- 按上下文边界拆分为独立服务
- 实现服务网格和分布式治理
- 建立完善的监控和调试体系

### 上下文边界调整原则

#### 何时拆分上下文？
- 团队规模超过上下文承载能力（7±2人原则）
- 上下文内出现明显的子领域分化
- 技术需求差异导致架构约束冲突
- 业务发展速度要求独立演进

#### 何时合并上下文？
- 频繁的跨上下文事务需求
- 上下文间的数据一致性要求极高
- 团队规模不足以支撑多个上下文
- 业务概念边界模糊，强行拆分带来复杂性

### 技术债务管理

#### 高优先级重构项
1. **权限模型统一**：解决权限控制上下文的复杂性
2. **事件驱动重构**：减少上下文间的同步依赖
3. **API一致性**：统一对外接口的设计模式

#### 监控指标
- **上下文耦合度**：跨上下文调用的频率和复杂性
- **数据一致性**：异步更新的成功率和延迟
- **团队生产力**：各上下文团队的开发速度和质量指标

---

## 维护与更新

**更新频率**：每半年回顾一次上下文边界，每年深度调整

**责任团队**：架构师、各上下文技术负责人

**评估标准**：
- 上下文内聚性和外部耦合度
- 团队自主性和开发效率
- 系统整体的可维护性和扩展性

这份上下文图将指导Outline的架构演进，确保系统能够支持业务的长期发展和团队的规模化协作。