# 术语映射（Ontology ↔ Code & DB）

将本体中的实体/关系，映射到代码模型与数据库表，便于跟踪实现与演进。

## 实体到代码与表

- **Team** → `server/models/Team.ts` → table: `teams`
  - 关键：`collections`, `documents`, `users` 关联；域名校验与偏好 `preferences`

- **User** → `server/models/User.ts` → table: `users`
  - 关键：角色 `role`，默认权限推导，计数统计 `getCounts()`，头像变更清理附件

- **Group** → `server/models/Group.ts` → table: `groups`
  - 关键：唯一性校验 `isUniqueNameInTeam`；成员 `GroupUser` 与授权 `GroupMembership`

- **Collection** → `server/models/Collection.ts` → table: `collections`
  - 关键：`documentStructure`（导航树），`permission`，`withMembership` 作用域
  - 钩子：`onBeforeSave` 生成 `content`，`cacheDocumentStructure`，`checkLastCollection`

- **Document** → `server/models/Document.ts` → table: `documents`
  - 关键：`publishedAt`、父子 `parentDocumentId`、派生授权复制（`publish()`）
  - 作用域：`withMembership(userId)`、`withViews(userId)`、`withDrafts`

- **Revision** → `server/models/Revision.ts` → table: `revisions`
  - 关键：`buildFromDocument()`、`createFromDocument()`、`before()`

- **Comment** → `server/models/Comment.ts` → table: `comments`
  - 关键：`resolve()`/`unresolve()`；层级评论（`parentCommentId`）

- **Attachment** → `server/models/Attachment.ts` → table: `attachments`
  - 关键：`key` 清洗/不可变；删除清理存储；`signedUrl`、`canonicalUrl`

- **UserMembership** → `server/models/UserMembership.ts` → table: `user_permissions`
  - 关键：`checkLastAdminBefore*`、`recreateSourcedMemberships()`（派生到子文档）

- **GroupMembership** → `server/models/GroupMembership.ts` → table: `group_permissions`
  - 关键：同上派生逻辑；组层面的保底校验

- **Share** → `server/models/Share.ts` → table: `shares`
  - 关键：`domain` 与团队域冲突校验；`revoke()`；`canonicalUrl`

- **View** → `server/models/View.ts` → table: `views`
  - 关键：`incrementOrCreate()`、`touch()`、`findByDocument()`

- **Star** → `server/models/Star.ts` → table: `stars`
- **Pin** → `server/models/Pin.ts` → table: `pins`

- **ApiKey** → `server/models/ApiKey.ts` → table: `apiKeys`
  - 关键：`value/hash/last4` 生成；`canAccess(path)` 校验 scope

- **AuthenticationProvider** → `server/models/AuthenticationProvider.ts` → table: `authentication_providers`
  - 关键：`disable()` 至少保留一个可用提供方；`oauthClient` 映射到插件

- **Integration** → `server/models/Integration.ts` → table: `integrations`
  - 关键：`withAuthentication` 作用域；强删时级联删除 `IntegrationAuthentication`

## 关系到实现

- 集合/文档授权：`UserMembership` 与 `GroupMembership` 同时存在时，权限取并集；派生通过 `sourceId` 与子文档查找实现。
- 文档结构维护：`Document.addDocumentToCollectionStructure`、`Collection.updateDocument`、`Collection.removeDocumentInStructure`。
- 统计/互动：`View.incrementOrCreate`、`User.getCounts`；用户头像与团队头像更换触发附件清理任务。

## 命名与前端

- URL 友好ID：`Document.urlId`、`Collection.urlId` 与 `slugify` 规则（见 `@shared/utils/slugify`）。
- 前端路径：`Document.getPath`、`Collection.path`。
