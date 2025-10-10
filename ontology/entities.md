# 实体清单（Entities Catalog）

基于 `server/models/` 抽取的核心实体、关键属性与标识。字段并非穷举，聚焦本体需要的语义与标识。

- **Team** (`server/models/Team.ts`, table: `teams`)
  - 标识：`id`
  - 关键属性：`name`、`subdomain`、`domain`、`preferences`、`defaultUserRole`、`sharing`
  - 说明：工作区（组织）。`url` 由自定义域或子域派生。

- **User** (`server/models/User.ts`, table: `users`)
  - 标识：`id`
  - 关键属性：`email`、`name`、`role`、`preferences`、`notificationSettings`、`language`
  - 说明：属于唯一 `teamId`。角色影响默认权限。

- **Group** (`server/models/Group.ts`, table: `groups`)
  - 标识：`id`
  - 关键属性：`name`、`externalId`
  - 说明：团队内用户分组，用于授权聚合。

- **Collection**（文集）(`server/models/Collection.ts`, table: `collections`)
  - 标识：`id`, 友好ID：`urlId`
  - 关键属性：`name`、`permission`、`sharing`、`documentStructure`、`sort`
  - 说明：知识树根容器，保存导航树（`NavigationNode[]`）。`permission=null` 表示私有。

- **Document**（文档）(`server/models/Document.ts`, table: `documents`)
  - 标识：`id`, 友好ID：`urlId`
  - 关键属性：`title`、`summary`、`content`、`state`（协作状态）`publishedAt`、`template`
  - 说明：可属于 `collectionId`，支持父子文档（`parentDocumentId`），发布/撤销影响集合结构。

- **Revision**（修订）(`server/models/Revision.ts`, table: `revisions`)
  - 标识：`id`
  - 关键属性：`version`、`editorVersion`、`title`、`content`、`collaboratorIds`
  - 说明：文档历史快照，用于还原。

- **Comment**（评论）(`server/models/Comment.ts`, table: `comments`)
  - 标识：`id`
  - 关键属性：`data`（ProseMirror JSON）、`reactions`、`resolvedAt`
  - 说明：支持评论/回复（`parentCommentId`），可解析为纯文本。

- **Attachment**（附件）(`server/models/Attachment.ts`, table: `attachments`)
  - 标识：`id`
  - 关键属性：`key`、`contentType`、`size`、`acl`、`expiresAt`
  - 说明：归属 `team`，可关联 `document`，URL 与签名下载由存储后端生成。

- **UserMembership**（用户授权）(`server/models/UserMembership.ts`, table: `user_permissions`)
  - 标识：`id`
  - 关键属性：`permission`（集合/文档）
  - 说明：用户在集合或文档级别的显式授权；支持“源授权”到子文档的派生（`sourceId`）。

- **GroupMembership**（群组授权）(`server/models/GroupMembership.ts`, table: `group_permissions`)
  - 标识：`id`
  - 关键属性：`permission`（集合/文档）
  - 说明：群组在集合或文档级别的授权；支持对子文档的派生（`sourceId`）。

- **Share**（分享链接）(`server/models/Share.ts`, table: `shares`)
  - 标识：`id`, 可选短链：`urlId`
  - 关键属性：`published`、`includeChildDocuments`、`domain`、`views`
  - 说明：支持自定义域；可指向集合或文档；可撤销。

- **View**（浏览）(`server/models/View.ts`, table: `views`)
  - 标识：`id`
  - 关键属性：`count`、`lastEditingAt`
  - 说明：用户-文档层面的浏览/编辑触达计数。

- **Star**（收藏）(`server/models/Star.ts`, table: `stars`)
  - 标识：`id`
  - 关键属性：`index`
  - 说明：用户的个人收藏，目标可为文档或集合。

- **Pin**（置顶）(`server/models/Pin.ts`, table: `pins`)
  - 标识：`id`
  - 关键属性：`index`
  - 说明：团队内首页/集合的置顶条目，目标通常为文档。

- **ApiKey**（API密钥）(`server/models/ApiKey.ts`, table: `apiKeys`)
  - 标识：`id`
  - 关键属性：`name`、`scope[]`、`hash`、`last4`、`expiresAt`、`lastActiveAt`
  - 说明：归属于用户；`scope` 控制可访问 API 路径。

- **AuthenticationProvider**（认证提供方）(`server/models/AuthenticationProvider.ts`, table: `authentication_providers`)
  - 标识：`id`
  - 关键属性：`name`、`enabled`、`providerId`
  - 说明：团队级第三方登录配置（Google/Azure/OIDC）。

- **Integration**（集成）(`server/models/Integration.ts`, table: `integrations`)
  - 标识：`id`
  - 关键属性：`type`、`service`、`settings`、`events`、`issueSources`
  - 说明：团队或集合级外部集成，含鉴权引用（`authenticationId`）。
