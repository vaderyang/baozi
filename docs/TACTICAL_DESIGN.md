# DDD战术设计文档

本文档基于领域驱动设计（DDD）的战术模式，分析了Outline知识管理平台在限界上下文内部的领域模型设计，包括聚合、实体、值对象、领域服务、仓储模式等核心概念的应用现状和重构建议。

## 目录

- [概述](#概述)
- [聚合设计](#聚合设计)
- [实体与值对象](#实体与值对象)
- [领域服务](#领域服务)
- [仓储模式](#仓储模式)
- [领域事件](#领域事件)
- [工厂模式](#工厂模式)
- [应用服务层](#应用服务层)
- [重构建议](#重构建议)
- [最佳实践](#最佳实践)

## 概述

### 当前架构特点
Outline当前采用基于Sequelize ORM的Active Record模式，具有以下特征：
- **数据模型驱动**：以数据库表结构为中心的设计
- **贫血模型**：大部分业务逻辑分散在Service层和Command层
- **ORM耦合**：领域模型与数据持久化紧密耦合
- **事件机制**：已有基础的领域事件支持

### DDD战术设计目标
- **富领域模型**：将业务逻辑封装到领域对象中
- **清晰边界**：通过聚合明确一致性边界
- **表达性API**：通过值对象和领域服务提供业务语言的表达
- **解耦设计**：通过仓储模式分离业务逻辑和数据存储

## 聚合设计

### 核心聚合识别

基于业务不变量和事务一致性要求，识别以下核心聚合：

#### 1. Document聚合
**聚合根**: Document  
**聚合边界**: Document + Revision + CollaborationSession  
**业务不变量**: 
- 文档版本的线性一致性
- 协作编辑的冲突解决
- 文档发布状态的完整性

```typescript
// 当前实现分析
class Document extends ArchivableModel {
  // 聚合根特征：
  // ✅ 具有全局唯一标识 (id, urlId)
  // ✅ 控制访问入口
  // ❌ 业务逻辑分散，未充分封装

  // 建议的聚合根设计
  class DocumentAggregate {
    private constructor(
      private readonly id: DocumentId,
      private title: DocumentTitle,
      private content: DocumentContent,
      private revisions: Revision[],
      private collaborationState: CollaborationState
    ) {}

    // 业务行为封装
    public updateContent(newContent: DocumentContent, editor: UserId): DomainEvent[] {
      this.validateEditPermission(editor);
      const oldContent = this.content;
      this.content = newContent;
      
      // 创建版本记录
      const revision = Revision.create(oldContent, editor, new Date());
      this.revisions.push(revision);
      
      return [
        new DocumentContentUpdatedEvent(this.id, editor, newContent),
        new DocumentRevisionCreatedEvent(this.id, revision.id)
      ];
    }

    public publish(publisher: UserId, collectionId: CollectionId): DomainEvent[] {
      this.validatePublishPermission(publisher);
      
      if (this.isPublished) {
        throw new DomainError("Document is already published");
      }

      this.publishedAt = new Date();
      this.collectionId = collectionId;

      return [new DocumentPublishedEvent(this.id, publisher, collectionId)];
    }
  }
}
```

#### 2. Collection聚合
**聚合根**: Collection  
**聚合边界**: Collection + DocumentHierarchy + Pin  
**业务不变量**:
- 文档层次结构的完整性
- 集合权限的一致性
- Pin排序的唯一性

```typescript
class CollectionAggregate {
  private constructor(
    private readonly id: CollectionId,
    private name: CollectionName,
    private hierarchy: DocumentHierarchy,
    private permissions: CollectionPermissions,
    private pins: Pin[]
  ) {}

  public addDocument(document: DocumentId, parent?: DocumentId): DomainEvent[] {
    this.hierarchy.addDocument(document, parent);
    
    // 维护业务不变量：层次结构完整性
    if (this.hierarchy.hasCircularReference()) {
      throw new DomainError("Circular reference detected in document hierarchy");
    }

    return [new DocumentAddedToCollectionEvent(this.id, document)];
  }

  public pinDocument(document: DocumentId, position: number): DomainEvent[] {
    // 业务规则：同一位置不能有多个Pin
    this.pins = this.pins.filter(p => p.position !== position);
    this.pins.push(new Pin(document, position));
    
    return [new DocumentPinnedEvent(this.id, document, position)];
  }
}
```

#### 3. User聚合
**聚合根**: User  
**聚合边界**: User + UserPreferences + NotificationSettings  
**业务不变量**:
- 用户角色的权限一致性
- 通知设置的完整性
- 认证状态的有效性

```typescript
class UserAggregate {
  private constructor(
    private readonly id: UserId,
    private profile: UserProfile,
    private role: UserRole,
    private preferences: UserPreferences,
    private notificationSettings: NotificationSettings
  ) {}

  public changeRole(newRole: UserRole, changer: UserId): DomainEvent[] {
    this.validateRoleChangePermission(changer);
    
    const oldRole = this.role;
    this.role = newRole;
    
    // 角色变更时自动调整权限
    this.adjustPermissionsForRole(newRole);
    
    return [new UserRoleChangedEvent(this.id, oldRole, newRole, changer)];
  }

  public updatePreferences(newPreferences: Partial<UserPreferences>): DomainEvent[] {
    this.preferences = { ...this.preferences, ...newPreferences };
    return [new UserPreferencesUpdatedEvent(this.id, newPreferences)];
  }
}
```

### 聚合间关系设计

#### 聚合引用规则
```typescript
// ✅ 正确：通过ID引用其他聚合
class Document {
  private collectionId: CollectionId;  // 引用Collection聚合
  private createdById: UserId;         // 引用User聚合
}

// ❌ 错误：直接引用聚合实例
class Document {
  private collection: Collection;  // 违反聚合边界
}
```

#### 跨聚合业务操作
```typescript
// 通过领域服务协调多个聚合
class DocumentPublishingService {
  constructor(
    private documentRepo: DocumentRepository,
    private collectionRepo: CollectionRepository,
    private userRepo: UserRepository
  ) {}

  async publishDocument(
    documentId: DocumentId,
    collectionId: CollectionId,
    publisherId: UserId
  ): Promise<void> {
    // 加载相关聚合
    const document = await this.documentRepo.findById(documentId);
    const collection = await this.collectionRepo.findById(collectionId);
    const publisher = await this.userRepo.findById(publisherId);

    // 跨聚合的业务规则验证
    if (!collection.allowsPublishing(publisher.role)) {
      throw new DomainError("User does not have permission to publish to this collection");
    }

    // 在各自聚合内执行业务逻辑
    const documentEvents = document.publish(publisherId, collectionId);
    const collectionEvents = collection.addDocument(documentId);

    // 持久化变更
    await this.documentRepo.save(document);
    await this.collectionRepo.save(collection);

    // 发布领域事件
    this.eventBus.publishAll([...documentEvents, ...collectionEvents]);
  }
}
```

## 实体与值对象

### 实体识别

实体具有唯一标识和生命周期，在Outline中识别出以下实体：

#### 核心实体
```typescript
// Document - 文档实体
class Document {
  private readonly id: DocumentId;        // 唯一标识
  private title: DocumentTitle;
  private content: DocumentContent;
  private publishedAt?: Date;              // 状态变化
  private lastModifiedAt: Date;           // 生命周期跟踪
}

// User - 用户实体  
class User {
  private readonly id: UserId;
  private profile: UserProfile;
  private role: UserRole;                  // 角色可以变化
  private lastActiveAt?: Date;
}

// Collection - 集合实体
class Collection {
  private readonly id: CollectionId;
  private name: CollectionName;
  private documentStructure: DocumentHierarchy;  // 结构可变
}
```

### 值对象设计

值对象表示概念性整体，具有不可变性和值相等特征：

#### 标识值对象
```typescript
// 强类型ID - 防止ID混用
class DocumentId extends ValueObject<string> {
  constructor(value: string) {
    super(value);
    this.validate();
  }

  private validate(): void {
    if (!this.value || this.value.length !== 36) {
      throw new DomainError("Invalid document ID format");
    }
  }
}

class UserId extends ValueObject<string> { /* 类似实现 */ }
class CollectionId extends ValueObject<string> { /* 类似实现 */ }
```

#### 业务概念值对象
```typescript
// 文档内容值对象
class DocumentContent extends ValueObject<ProsemirrorData> {
  constructor(content: ProsemirrorData) {
    super(content);
    this.validateStructure();
  }

  public wordCount(): number {
    return ProsemirrorHelper.getWordCount(this.value);
  }

  public extractSummary(maxLength: number = 280): string {
    return ProsemirrorHelper.getSummary(this.value, maxLength);
  }

  private validateStructure(): void {
    if (!this.value || typeof this.value !== 'object') {
      throw new DomainError("Invalid document content structure");
    }
  }
}

// 用户角色值对象
class UserRole extends ValueObject<string> {
  static readonly ADMIN = new UserRole('admin');
  static readonly MEMBER = new UserRole('member');
  static readonly VIEWER = new UserRole('viewer');
  static readonly GUEST = new UserRole('guest');

  public hasPermission(permission: Permission): boolean {
    const rolePermissions = {
      admin: [Permission.READ, Permission.WRITE, Permission.DELETE, Permission.MANAGE],
      member: [Permission.READ, Permission.WRITE],
      viewer: [Permission.READ],
      guest: [Permission.READ] // 受限读取
    };
    
    return rolePermissions[this.value]?.includes(permission) || false;
  }
}

// 文档层次位置值对象
class DocumentPosition extends ValueObject<{parentId?: DocumentId, index: string}> {
  constructor(parentId: DocumentId | undefined, index: string) {
    super({ parentId, index });
    this.validateIndex();
  }

  private validateIndex(): void {
    // 使用fractional indexing确保排序一致性
    if (!/^[0-9a-zA-Z]{1,}$/.test(this.value.index)) {
      throw new DomainError("Invalid document position index");
    }
  }

  public isBefore(other: DocumentPosition): boolean {
    return this.value.index < other.value.index;
  }
}
```

#### 地址和联系信息值对象
```typescript
// 邮箱地址值对象
class EmailAddress extends ValueObject<string> {
  constructor(email: string) {
    super(email.toLowerCase().trim());
    this.validate();
  }

  private validate(): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.value)) {
      throw new DomainError("Invalid email address format");
    }
  }

  public domain(): string {
    return this.value.split('@')[1];
  }
}

// 颜色值对象
class Color extends ValueObject<string> {
  constructor(color: string) {
    super(color.toUpperCase());
    this.validate();
  }

  private validate(): void {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(this.value)) {
      throw new DomainError("Invalid color format, must be hex color");
    }
  }

  public toRGB(): { r: number; g: number; b: number } {
    const hex = this.value.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return { r, g, b };
  }
}
```

### 实体与值对象重构建议

#### 当前问题
1. **Active Record贫血症**：业务逻辑分散在外部服务中
2. **值对象缺失**：基本类型泛滥，缺乏业务语义
3. **边界不清**：实体职责混乱，包含过多技术细节

#### 重构路径
```typescript
// 步骤1：引入值对象替换基本类型
// Before
class Document {
  id: string;
  title: string;
  color: string | null;
}

// After  
class Document {
  id: DocumentId;
  title: DocumentTitle;
  color?: Color;
}

// 步骤2：将业务逻辑移入实体
// Before (贫血模型)
class DocumentService {
  async updateTitle(docId: string, newTitle: string) {
    const doc = await this.documentRepo.findById(docId);
    doc.title = newTitle;
    doc.updatedAt = new Date();
    return this.documentRepo.save(doc);
  }
}

// After (充血模型)
class Document {
  updateTitle(newTitle: DocumentTitle): DomainEvent[] {
    this.validateTitleChange(newTitle);
    const oldTitle = this.title;
    this.title = newTitle;
    this.markAsModified();
    
    return [new DocumentTitleChangedEvent(this.id, oldTitle, newTitle)];
  }

  private validateTitleChange(newTitle: DocumentTitle): void {
    if (this.isArchived) {
      throw new DomainError("Cannot update title of archived document");
    }
  }
}
```

## 领域服务

### 领域服务识别

领域服务处理跨实体或不自然属于单一实体的业务逻辑：

#### 1. 文档协作服务
```typescript
class DocumentCollaborationService {
  constructor(
    private conflictResolver: ConflictResolver,
    private operationTransformer: OperationTransformer
  ) {}

  /**
   * 处理实时协作编辑中的操作冲突
   * 这是典型的领域服务：涉及多个文档状态的协调
   */
  public resolveEditingConflicts(
    document: Document,
    localOperations: EditOperation[],
    remoteOperations: EditOperation[]
  ): EditOperationResult {
    // 复杂的冲突解决算法
    const transformedLocal = this.operationTransformer.transformAgainst(
      localOperations, 
      remoteOperations
    );
    
    const resolvedState = this.conflictResolver.resolve(
      document.currentState,
      transformedLocal,
      remoteOperations
    );

    return new EditOperationResult(resolvedState, transformedLocal);
  }
}
```

#### 2. 权限验证服务
```typescript
class PermissionService {
  /**
   * 跨聚合的权限检查逻辑
   * 需要协调User、Collection、Document多个聚合的状态
   */
  public canUserAccessDocument(
    user: User, 
    document: Document, 
    collection: Collection,
    accessType: AccessType
  ): boolean {
    // 基础角色权限检查
    if (!user.role.hasPermission(this.mapToPermission(accessType))) {
      return false;
    }

    // 集合级别权限检查
    if (!collection.allowsAccess(user.id, accessType)) {
      return false;
    }

    // 文档特定权限检查
    if (document.hasExplicitPermissions()) {
      return document.allowsAccess(user.id, accessType);
    }

    // 继承集合权限
    return collection.getDefaultPermission().allows(accessType);
  }

  private mapToPermission(accessType: AccessType): Permission {
    const mapping = {
      [AccessType.READ]: Permission.READ,
      [AccessType.WRITE]: Permission.WRITE,
      [AccessType.DELETE]: Permission.DELETE,
    };
    return mapping[accessType];
  }
}
```

#### 3. 搜索索引服务
```typescript
class SearchIndexingService {
  constructor(
    private searchEngine: SearchEngine,
    private permissionService: PermissionService
  ) {}

  /**
   * 文档索引更新 - 跨越搜索和权限两个领域
   */
  public async updateDocumentIndex(document: Document): Promise<void> {
    const searchableContent = this.extractSearchableContent(document);
    
    // 构建权限过滤器
    const permissionFilters = await this.buildPermissionFilters(document);
    
    const indexEntry = new SearchIndexEntry(
      document.id,
      searchableContent,
      permissionFilters,
      document.lastModifiedAt
    );

    await this.searchEngine.index(indexEntry);
  }

  private extractSearchableContent(document: Document): SearchableContent {
    return new SearchableContent(
      document.title.value,
      document.content.extractText(),
      document.extractKeywords(),
      document.tags
    );
  }
}
```

## 仓储模式

### 仓储接口设计

仓储模式将领域模型与数据存储分离：

#### 聚合仓储接口
```typescript
// 文档聚合仓储接口
interface DocumentRepository {
  // 基础CRUD操作
  findById(id: DocumentId): Promise<Document | null>;
  findByUrlId(urlId: string): Promise<Document | null>;
  save(document: Document): Promise<void>;
  remove(document: Document): Promise<void>;

  // 业务查询方法
  findByCollection(collectionId: CollectionId): Promise<Document[]>;
  findPublishedDocuments(criteria: PublishedDocumentCriteria): Promise<Document[]>;
  findRecentlyModified(userId: UserId, limit: number): Promise<Document[]>;
  
  // 复杂查询使用规约模式
  findMatching(specification: DocumentSpecification): Promise<Document[]>;
}

// 集合仓储接口
interface CollectionRepository {
  findById(id: CollectionId): Promise<Collection | null>;
  findByTeam(teamId: TeamId): Promise<Collection[]>;
  findAccessibleToUser(userId: UserId): Promise<Collection[]>;
  save(collection: Collection): Promise<void>;
  remove(collection: Collection): Promise<void>;
}

// 用户仓储接口
interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: EmailAddress): Promise<User | null>;
  findByTeam(teamId: TeamId): Promise<User[]>;
  save(user: User): Promise<void>;
  remove(user: User): Promise<void>;
}
```

#### 规约模式查询
```typescript
// 文档查询规约
abstract class DocumentSpecification {
  abstract isSatisfiedBy(document: Document): boolean;
  abstract toSQLCriteria(): SQLCriteria;
}

class PublishedDocumentSpecification extends DocumentSpecification {
  isSatisfiedBy(document: Document): boolean {
    return document.isPublished();
  }

  toSQLCriteria(): SQLCriteria {
    return { publishedAt: { [Op.ne]: null } };
  }
}

class UserAccessibleDocumentSpecification extends DocumentSpecification {
  constructor(private userId: UserId) {
    super();
  }

  isSatisfiedBy(document: Document): boolean {
    // 在内存中的业务逻辑验证
    return document.isAccessibleToUser(this.userId);
  }

  toSQLCriteria(): SQLCriteria {
    // 转换为数据库查询条件
    return {
      [Op.or]: [
        { createdById: this.userId.value },
        { 
          collectionId: { 
            [Op.in]: { /* 子查询用户可访问的集合 */ }
          }
        }
      ]
    };
  }
}

// 组合规约
class AndSpecification<T> extends DocumentSpecification {
  constructor(
    private left: DocumentSpecification,
    private right: DocumentSpecification
  ) {
    super();
  }

  isSatisfiedBy(document: Document): boolean {
    return this.left.isSatisfiedBy(document) && this.right.isSatisfiedBy(document);
  }

  toSQLCriteria(): SQLCriteria {
    return {
      [Op.and]: [
        this.left.toSQLCriteria(),
        this.right.toSQLCriteria()
      ]
    };
  }
}
```

#### 仓储实现模式
```typescript
// Sequelize仓储实现
class SequelizeDocumentRepository implements DocumentRepository {
  constructor(private model: typeof Document) {}

  async findById(id: DocumentId): Promise<Document | null> {
    const record = await this.model.findByPk(id.value, {
      include: this.getDefaultIncludes()
    });
    
    return record ? this.toDomainEntity(record) : null;
  }

  async save(document: Document): Promise<void> {
    const record = this.toDataRecord(document);
    
    // 处理新实体 vs 更新实体
    if (document.isNew()) {
      await this.model.create(record);
    } else {
      await this.model.update(record, {
        where: { id: document.id.value }
      });
    }

    // 处理聚合内的关联实体
    await this.saveChildEntities(document);
  }

  private toDomainEntity(record: any): Document {
    // ORM记录转换为领域实体
    return Document.reconstitute(
      new DocumentId(record.id),
      new DocumentTitle(record.title),
      new DocumentContent(record.content),
      // ... 其他属性
    );
  }

  private toDataRecord(document: Document): any {
    // 领域实体转换为数据记录
    return {
      id: document.id.value,
      title: document.title.value,
      content: document.content.value,
      // ... 其他映射
    };
  }
}
```

### 查询对象模式

对于复杂的读取操作，使用查询对象模式：

```typescript
// 文档统计查询对象
class DocumentStatisticsQuery {
  constructor(
    private readonly db: Database,
    private readonly permissionService: PermissionService
  ) {}

  async getTeamStatistics(teamId: TeamId, userId: UserId): Promise<TeamStatistics> {
    // 原生SQL查询优化的读取操作
    const stats = await this.db.query(`
      SELECT 
        COUNT(CASE WHEN published_at IS NOT NULL THEN 1 END) as published_count,
        COUNT(CASE WHEN published_at IS NULL THEN 1 END) as draft_count,
        COUNT(DISTINCT created_by_id) as author_count,
        AVG(LENGTH(text)) as avg_content_length
      FROM documents 
      WHERE team_id = :teamId 
        AND deleted_at IS NULL
        AND collection_id IN (
          SELECT id FROM collections 
          WHERE team_id = :teamId 
            AND /* 用户访问权限过滤 */
        )
    `, { teamId: teamId.value });

    return new TeamStatistics(stats[0]);
  }
}

// 搜索查询对象
class DocumentSearchQuery {
  constructor(
    private readonly searchEngine: SearchEngine,
    private readonly permissionService: PermissionService
  ) {}

  async search(
    query: SearchQuery, 
    user: User,
    pagination: Pagination
  ): Promise<SearchResult<DocumentSearchItem>> {
    // 构建搜索条件
    const searchCriteria = this.buildSearchCriteria(query, user);
    
    // 执行搜索
    const results = await this.searchEngine.search(searchCriteria, pagination);
    
    // 转换为查询结果对象
    return new SearchResult(
      results.items.map(item => new DocumentSearchItem(
        new DocumentId(item.id),
        item.title,
        item.summary,
        item.highlights,
        item.relevanceScore
      )),
      results.totalCount,
      pagination
    );
  }
}
```

## 领域事件

### 事件识别和设计

#### 核心领域事件
```typescript
// 文档相关事件
class DocumentCreatedEvent extends DomainEvent {
  constructor(
    public readonly documentId: DocumentId,
    public readonly createdBy: UserId,
    public readonly collectionId: CollectionId,
    public readonly title: DocumentTitle,
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}

class DocumentPublishedEvent extends DomainEvent {
  constructor(
    public readonly documentId: DocumentId,
    public readonly publishedBy: UserId,
    public readonly collectionId: CollectionId,
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}

class DocumentContentUpdatedEvent extends DomainEvent {
  constructor(
    public readonly documentId: DocumentId,
    public readonly updatedBy: UserId,
    public readonly previousVersion: number,
    public readonly newVersion: number,
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}

// 协作相关事件
class DocumentCollaborationStartedEvent extends DomainEvent {
  constructor(
    public readonly documentId: DocumentId,
    public readonly collaborators: UserId[],
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}

class CommentAddedEvent extends DomainEvent {
  constructor(
    public readonly commentId: CommentId,
    public readonly documentId: DocumentId,
    public readonly authorId: UserId,
    public readonly content: string,
    public readonly position: CommentPosition,
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}

// 用户相关事件
class UserJoinedTeamEvent extends DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly teamId: TeamId,
    public readonly role: UserRole,
    public readonly invitedBy: UserId,
    occurredOn: Date = new Date()
  ) {
    super(occurredOn);
  }
}
```

#### 事件发布和处理机制
```typescript
// 事件总线接口
interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventType: new (...args: any[]) => T,
    handler: EventHandler<T>
  ): void;
}

// 事件处理器接口
interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
}

// 具体事件处理器示例
class DocumentIndexingHandler implements EventHandler<DocumentContentUpdatedEvent> {
  constructor(private searchIndexService: SearchIndexingService) {}

  async handle(event: DocumentContentUpdatedEvent): Promise<void> {
    // 异步更新搜索索引
    const document = await this.documentRepository.findById(event.documentId);
    if (document) {
      await this.searchIndexService.updateDocumentIndex(document);
    }
  }
}

class NotificationHandler implements EventHandler<CommentAddedEvent> {
  constructor(
    private notificationService: NotificationService,
    private userRepository: UserRepository
  ) {}

  async handle(event: CommentAddedEvent): Promise<void> {
    // 通知文档作者和相关用户
    const document = await this.documentRepository.findById(event.documentId);
    const interestedUsers = await this.findInterestedUsers(document);
    
    await this.notificationService.notifyUsers(
      interestedUsers,
      new CommentNotification(event.commentId, event.documentId, event.authorId)
    );
  }
}
```

#### 事件溯源可能性分析
```typescript
// 事件存储接口
interface EventStore {
  append(streamId: string, events: DomainEvent[]): Promise<void>;
  getEvents(streamId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getAllEvents(fromPosition?: number): Promise<DomainEvent[]>;
}

// 聚合可以从事件重建
class DocumentAggregate {
  static fromHistory(events: DomainEvent[]): DocumentAggregate {
    const aggregate = new DocumentAggregate();
    
    events.forEach(event => {
      aggregate.apply(event);
    });

    return aggregate;
  }

  private apply(event: DomainEvent): void {
    switch (event.constructor) {
      case DocumentCreatedEvent:
        this.applyDocumentCreated(event as DocumentCreatedEvent);
        break;
      case DocumentContentUpdatedEvent:
        this.applyContentUpdated(event as DocumentContentUpdatedEvent);
        break;
      // ... 其他事件处理
    }
  }

  private applyDocumentCreated(event: DocumentCreatedEvent): void {
    this.id = event.documentId;
    this.title = event.title;
    this.createdBy = event.createdBy;
    this.collectionId = event.collectionId;
  }
}
```

## 工厂模式

### 复杂对象创建

#### 文档工厂
```typescript
class DocumentFactory {
  constructor(
    private templateService: TemplateService,
    private permissionService: PermissionService
  ) {}

  /**
   * 根据模板创建文档
   */
  async createFromTemplate(
    templateId: TemplateId,
    creator: User,
    options: DocumentCreationOptions
  ): Promise<Document> {
    const template = await this.templateService.getTemplate(templateId);
    
    if (!this.permissionService.canUserUseTemplate(creator, template)) {
      throw new DomainError("User does not have permission to use this template");
    }

    // 应用模板变量替换
    const processedContent = this.processTemplateVariables(
      template.content, 
      creator, 
      options.variables
    );

    const documentId = DocumentId.generate();
    
    return Document.create(
      documentId,
      new DocumentTitle(options.title || template.defaultTitle),
      processedContent,
      creator.id,
      options.collectionId,
      {
        templateId: template.id,
        icon: options.icon || template.defaultIcon,
        color: options.color || template.defaultColor,
        isTemplate: false
      }
    );
  }

  /**
   * 创建空白文档
   */
  createBlankDocument(
    creator: User,
    collectionId: CollectionId,
    title?: string
  ): Document {
    return Document.create(
      DocumentId.generate(),
      new DocumentTitle(title || "Untitled"),
      DocumentContent.empty(),
      creator.id,
      collectionId
    );
  }

  /**
   * 从导入数据创建文档
   */
  async createFromImport(
    importData: ImportData,
    importer: User,
    collectionId: CollectionId
  ): Promise<Document[]> {
    const documents: Document[] = [];
    
    for (const item of importData.items) {
      const content = await this.convertImportContent(item.content, item.format);
      
      const document = Document.create(
        DocumentId.generate(),
        new DocumentTitle(item.title),
        content,
        importer.id,
        collectionId,
        {
          sourceMetadata: {
            importSource: importData.source,
            originalId: item.originalId,
            importedAt: new Date()
          }
        }
      );

      documents.push(document);
    }

    return documents;
  }

  private processTemplateVariables(
    content: DocumentContent,
    user: User,
    variables: Record<string, string>
  ): DocumentContent {
    // 模板变量替换逻辑
    const context = {
      user: {
        name: user.name,
        email: user.email.value,
        // ...
      },
      date: new Date().toISOString(),
      ...variables
    };

    return content.replaceVariables(context);
  }
}
```

#### 聚合工厂
```typescript
class CollectionFactory {
  constructor(
    private permissionService: PermissionService,
    private teamService: TeamService
  ) {}

  async createCollection(
    name: CollectionName,
    creator: User,
    team: Team,
    options: CollectionCreationOptions = {}
  ): Promise<Collection> {
    // 验证创建权限
    if (!this.permissionService.canUserCreateCollection(creator, team)) {
      throw new DomainError("User does not have permission to create collections");
    }

    // 验证名称唯一性
    const existingCollection = await this.teamService.findCollectionByName(team.id, name);
    if (existingCollection) {
      throw new DomainError("Collection name already exists in this team");
    }

    const collectionId = CollectionId.generate();
    
    return Collection.create(
      collectionId,
      name,
      creator.id,
      team.id,
      {
        description: options.description,
        icon: options.icon,
        color: options.color,
        permission: options.defaultPermission || CollectionPermission.ReadWrite,
        sort: options.sort || { field: 'title', direction: 'asc' }
      }
    );
  }
}
```

## 应用服务层

### 应用服务职责

应用服务协调领域模型执行用例，但不包含业务逻辑：

#### 文档应用服务
```typescript
class DocumentApplicationService {
  constructor(
    private documentRepository: DocumentRepository,
    private collectionRepository: CollectionRepository,
    private userRepository: UserRepository,
    private permissionService: PermissionService,
    private documentFactory: DocumentFactory,
    private eventBus: EventBus
  ) {}

  async createDocument(command: CreateDocumentCommand): Promise<DocumentResponse> {
    // 1. 验证和加载聚合
    const creator = await this.userRepository.findById(command.creatorId);
    if (!creator) {
      throw new ApplicationError("Creator not found");
    }

    const collection = await this.collectionRepository.findById(command.collectionId);
    if (!collection) {
      throw new ApplicationError("Collection not found");
    }

    // 2. 权限检查
    if (!this.permissionService.canUserCreateDocument(creator, collection)) {
      throw new UnauthorizedError("User cannot create document in this collection");
    }

    // 3. 使用工厂创建聚合
    const document = command.templateId
      ? await this.documentFactory.createFromTemplate(
          command.templateId, 
          creator, 
          command.toCreationOptions()
        )
      : this.documentFactory.createBlankDocument(
          creator,
          command.collectionId,
          command.title
        );

    // 4. 执行业务逻辑（在聚合内部）
    const events: DomainEvent[] = [];
    
    if (command.shouldPublish) {
      const publishEvents = document.publish(creator.id, command.collectionId);
      events.push(...publishEvents);
    }

    // 5. 持久化聚合
    await this.documentRepository.save(document);

    // 6. 发布领域事件
    await this.eventBus.publishAll(events);

    // 7. 返回应用层响应
    return new DocumentResponse(document);
  }

  async updateDocument(command: UpdateDocumentCommand): Promise<DocumentResponse> {
    // 加载聚合
    const document = await this.documentRepository.findById(command.documentId);
    if (!document) {
      throw new ApplicationError("Document not found");
    }

    const updater = await this.userRepository.findById(command.updaterId);
    if (!updater) {
      throw new ApplicationError("Updater not found");
    }

    // 权限检查
    if (!this.permissionService.canUserEditDocument(updater, document)) {
      throw new UnauthorizedError("User cannot edit this document");
    }

    // 执行业务逻辑
    const events: DomainEvent[] = [];
    
    if (command.title) {
      const titleEvents = document.updateTitle(new DocumentTitle(command.title));
      events.push(...titleEvents);
    }

    if (command.content) {
      const contentEvents = document.updateContent(
        new DocumentContent(command.content),
        updater.id
      );
      events.push(...contentEvents);
    }

    // 持久化和发布事件
    await this.documentRepository.save(document);
    await this.eventBus.publishAll(events);

    return new DocumentResponse(document);
  }
}
```

#### 协作应用服务
```typescript
class CollaborationApplicationService {
  constructor(
    private documentRepository: DocumentRepository,
    private userRepository: UserRepository,
    private collaborationService: DocumentCollaborationService,
    private eventBus: EventBus
  ) {}

  async processCollaborativeEdit(
    command: CollaborativeEditCommand
  ): Promise<CollaborativeEditResponse> {
    // 加载相关聚合
    const document = await this.documentRepository.findById(command.documentId);
    const editor = await this.userRepository.findById(command.editorId);

    if (!document || !editor) {
      throw new ApplicationError("Document or editor not found");
    }

    // 使用领域服务处理协作编辑
    const result = this.collaborationService.applyOperations(
      document,
      command.operations,
      editor.id
    );

    // 应用变更到聚合
    const events = document.applyEditingResult(result, editor.id);

    // 持久化
    await this.documentRepository.save(document);
    await this.eventBus.publishAll(events);

    return new CollaborativeEditResponse(result);
  }
}
```

### 命令和查询分离（CQRS）

#### 命令对象
```typescript
// 命令基类
abstract class Command {
  constructor(
    public readonly commandId: string = uuidv4(),
    public readonly occurredOn: Date = new Date()
  ) {}
}

// 具体命令
class CreateDocumentCommand extends Command {
  constructor(
    public readonly creatorId: UserId,
    public readonly collectionId: CollectionId,
    public readonly title?: string,
    public readonly content?: ProsemirrorData,
    public readonly templateId?: TemplateId,
    public readonly shouldPublish: boolean = false
  ) {
    super();
  }

  toCreationOptions(): DocumentCreationOptions {
    return {
      title: this.title,
      content: this.content ? new DocumentContent(this.content) : undefined,
      templateId: this.templateId
    };
  }
}

class PublishDocumentCommand extends Command {
  constructor(
    public readonly documentId: DocumentId,
    public readonly publisherId: UserId,
    public readonly collectionId: CollectionId
  ) {
    super();
  }
}
```

#### 查询对象
```typescript
// 查询基类
abstract class Query<TResult> {
  constructor(
    public readonly queryId: string = uuidv4(),
    public readonly occurredOn: Date = new Date()
  ) {}
}

// 具体查询
class GetDocumentQuery extends Query<DocumentResponse> {
  constructor(
    public readonly documentId: DocumentId,
    public readonly requesterId: UserId
  ) {
    super();
  }
}

class SearchDocumentsQuery extends Query<DocumentSearchResponse> {
  constructor(
    public readonly searchTerm: string,
    public readonly requesterId: UserId,
    public readonly filters: SearchFilters,
    public readonly pagination: Pagination
  ) {
    super();
  }
}

// 查询处理器
class DocumentQueryHandler {
  constructor(
    private documentRepository: DocumentRepository,
    private permissionService: PermissionService
  ) {}

  async handle(query: GetDocumentQuery): Promise<DocumentResponse> {
    const document = await this.documentRepository.findById(query.documentId);
    if (!document) {
      throw new NotFoundError("Document not found");
    }

    const requester = await this.userRepository.findById(query.requesterId);
    if (!this.permissionService.canUserViewDocument(requester, document)) {
      throw new UnauthorizedError("Access denied");
    }

    return new DocumentResponse(document);
  }
}
```

## 重构建议

### 当前架构问题分析

#### 1. 贫血领域模型
**问题**: 大部分业务逻辑在Service和Command层，模型只是数据容器
**影响**: 
- 业务逻辑分散，难以维护
- 违反了封装原则
- 缺乏表达性，难以理解业务概念

**解决方案**:
```typescript
// 当前实现（贫血模型）
class Document extends SequelizeModel {
  id: string;
  title: string;
  content: any;
  // 只有getter/setter，无业务行为
}

class DocumentService {
  async publish(documentId: string, collectionId: string) {
    const doc = await Document.findById(documentId);
    doc.publishedAt = new Date();
    doc.collectionId = collectionId;
    await doc.save();
    // 业务逻辑在服务中
  }
}

// 重构后（充血模型）
class Document {
  constructor(
    private id: DocumentId,
    private title: DocumentTitle,
    private content: DocumentContent,
    // ...
  ) {}

  publish(publisherId: UserId, collectionId: CollectionId): DomainEvent[] {
    if (this.isPublished()) {
      throw new DomainError("Document already published");
    }
    
    this.publishedAt = new Date();
    this.collectionId = collectionId;
    
    return [new DocumentPublishedEvent(this.id, publisherId, collectionId)];
  }
  
  // 业务逻辑封装在实体内部
}
```

#### 2. 值对象缺失
**问题**: 大量使用基本类型，缺乏业务语义
**解决方案**: 引入值对象表达业务概念

```typescript
// 之前
function updateDocument(id: string, title: string, color: string) {
  // string 类型无法表达业务含义和约束
}

// 之后
function updateDocument(
  id: DocumentId, 
  title: DocumentTitle, 
  color: Color
) {
  // 类型本身就表达了业务概念
}
```

#### 3. 聚合边界不清晰
**问题**: 实体间的关系复杂，事务边界不明确
**解决方案**: 重新设计聚合边界

#### 4. 缺乏领域事件
**问题**: 缺乏松耦合的跨聚合协作机制
**解决方案**: 引入领域事件驱动架构

### 重构路线图

#### 第一阶段：值对象重构（1-2个月）
1. **引入基础值对象**
   - DocumentId, UserId, CollectionId 等ID类型
   - EmailAddress, Color 等业务概念类型
   
2. **重构模型属性**
   - 将基本类型替换为值对象
   - 添加值对象的验证逻辑

3. **更新API层**
   - 修改控制器接收值对象
   - 更新序列化/反序列化逻辑

#### 第二阶段：领域事件（2-3个月）
1. **建立事件基础设施**
   - EventBus 实现
   - 事件存储机制
   
2. **识别和实现核心事件**
   - 文档生命周期事件
   - 用户协作事件
   
3. **重构现有业务逻辑**
   - 使用事件替换直接调用
   - 实现事件处理器

#### 第三阶段：充血模型（3-4个月）
1. **将业务逻辑移入实体**
   - 从Service层移动到实体内部
   - 保持单一职责原则
   
2. **重构聚合设计**
   - 明确聚合根和边界
   - 实现聚合内一致性

3. **引入领域服务**
   - 处理跨实体的业务逻辑
   - 协调多个聚合的操作

#### 第四阶段：仓储和应用服务（4-5个月）
1. **实现仓储抽象**
   - 定义仓储接口
   - 分离业务逻辑和数据访问
   
2. **重构应用服务**
   - 简化应用服务职责
   - 实现CQRS模式

3. **引入规约模式**
   - 复杂查询的抽象
   - 业务规则的封装

### 重构风险控制

#### 1. 渐进式重构
- 采用绞杀者模式（Strangler Fig Pattern）
- 新功能采用DDD模式，旧功能逐步重构
- 保持向后兼容

#### 2. 测试保障
- 为每个重构步骤编写单元测试
- 保持高测试覆盖率
- 使用契约测试确保API兼容性

#### 3. 监控和回滚
- 建立详细的监控指标
- 准备快速回滚方案
- 分阶段发布和验证

## 最佳实践

### 1. 聚合设计原则
- **小聚合**: 保持聚合尽可能小，减少锁竞争
- **通过ID引用**: 聚合间通过ID引用，避免对象引用
- **事务边界**: 一个事务只修改一个聚合实例
- **最终一致性**: 跨聚合使用事件实现最终一致性

### 2. 实体和值对象设计
- **身份vs值**: 有身份标识的用实体，概念整体用值对象
- **不变性**: 值对象保持不变性，实体可变但控制变化
- **验证**: 在构造时进行验证，确保对象始终有效
- **表达性**: 使用业务语言命名，提高代码可读性

### 3. 领域服务使用
- **无状态**: 领域服务应该是无状态的
- **纯函数**: 尽量设计为纯函数，便于测试
- **最小接口**: 只暴露必要的方法
- **单一职责**: 每个服务专注一个业务概念

### 4. 事件设计原则
- **过去时命名**: 事件表示已发生的事实
- **丰富信息**: 包含足够的上下文信息
- **版本兼容**: 考虑事件模式的演进兼容性
- **幂等处理**: 事件处理器应该是幂等的

### 5. 代码质量检查清单

#### 聚合检查点
- [ ] 聚合根控制所有访问入口
- [ ] 聚合边界内维护业务不变量
- [ ] 跨聚合使用ID引用
- [ ] 聚合大小合理（通常<10个实体）

#### 实体检查点
- [ ] 具有全局唯一标识
- [ ] 业务行为封装在实体内
- [ ] 状态变化通过方法控制
- [ ] 验证逻辑在适当位置

#### 值对象检查点
- [ ] 保持不变性
- [ ] 实现值相等比较
- [ ] 包含验证逻辑
- [ ] 提供有意义的行为方法

#### 领域服务检查点
- [ ] 处理跨实体业务逻辑
- [ ] 保持无状态
- [ ] 使用业务语言命名
- [ ] 不包含基础设施关注点

#### 事件检查点
- [ ] 使用过去时命名
- [ ] 包含足够上下文信息
- [ ] 事件处理是幂等的
- [ ] 支持事件版本演进

---

## 总结

DDD战术设计为Outline提供了构建富表达性和高内聚领域模型的指导。通过合理应用聚合、实体、值对象、领域服务等模式，可以：

1. **提高代码质量**: 业务逻辑集中，易于理解和维护
2. **增强表达力**: 代码直接反映业务概念和规则  
3. **改善可测试性**: 纯领域逻辑易于单元测试
4. **支持演进**: 清晰的边界支持系统持续演进

重构应该是渐进式的，优先从价值对象和领域事件开始，逐步向充血模型和完整的DDD架构演进。每个阶段都要有充分的测试保障和监控，确保系统稳定性。

这份战术设计文档将作为团队的参考指南，指导Outline向更加成熟的领域驱动架构发展。