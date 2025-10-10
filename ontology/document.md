# Document（文档）实体化定义

本文件定义知识库中 Document（文档）的领域语义、关键属性、与在文档内各类功能（代码块、嵌入、上传等）的语义约定与实现映射，面向研发/产品/数据统一理解。

参考实现：
- 代码模型：server/models/Document.ts
- 编辑器节点：shared/editor/nodes/*，shared/editor/embeds/*
- 附件与上传：server/routes/api/attachments/*，server/models/Attachment.ts
- 通用外链嵌入：plugins/iframely


一、实体概览（What is a Document）
- 领域定位：知识条目的承载单位，可发布到某个文集（Collection），形成层级结构（父子文档）。
- 生命周期：草稿（未发布）→ 发布（进入文集导航）→ 归档/删除（可还原）→ 还原/彻底删除。
- 协作能力：多人实时协作（Yjs），版本历史（Revision），评论（Comment），浏览计数（View），收藏/置顶（Star/Pin）。


二、标识与关键字段（Identity & Core Fields）
- id：主键 UUID
- urlId：友好短ID（10位），用于 URL 构造（Document.getPath）
- title/summary/icon/color：标题、摘要、图标与配色（同时影响导航节点展示）
- content（JSONB）：ProseMirror 文档快照（最新保存态）
- state（BLOB）：Yjs 协作二进制状态（仅在 content 不可用时读取，体量较大）
- text（TEXT，废弃）：历史 Markdown 文本，仅兼容导出或遗留数据（请使用 content/state 与 DocumentHelper）
- version/editorVersion：文档与编辑器版本号，便于兼容控制
- publishedAt：发布时间（是否纳入文集导航的判定）
- collectionId/parentDocumentId：所属文集与父文档（自关联）
- collaboratorIds：[UUID] 协作者列表（更新时补记）
- revisionCount：修订次数（用于历史版本）

语义要点：
- “发布态”由 publishedAt 是否为 null 判定；非模板、非草稿才进入文集导航（Collection.documentStructure）。
- URL 规则：/doc/<slugified-title>-<urlId>；当标题为空或 slug 为空时回退为 /doc/untitled-<urlId>。


三、权限与可见性（Authorization & Visibility）
- 基于 Collection.permission 与 Document 级授权（UserMembership/GroupMembership）。
- 发布时从父文档复制授权到子文档（Document.publish → GroupMembership.copy / UserMembership.copy）。
- “withMembership(userId)”/“withViews(userId)” 作用域用于查询时注入可见性与计数。


四、结构关系（Structure）
- 文集（Collection）→ 文档（Document）为 1-N。
- 文档自关联形成父子层级，禁止循环（checkParentDocument）。
- 文档发布/标题变更会同步到文集导航（updateCollectionStructure / addDocumentToCollectionStructure）。


五、内容模型与功能语义（Features inside a Document）
本节描述“在 Document 内容中”可出现的主要块/内联元素及外部能力，并给出实现映射。

1) 代码块（Code Block / Fence）
- 语义：展示与编辑程序代码，支持语言高亮、行号、复制、Tab/缩进，以及三反引号分割。
- 节点：shared/editor/nodes/CodeFence.ts、CodeBlock.ts
- 关键属性：language（默认 javascript），是否显示行号取决于用户偏好（codeBlockLineNumbers）。
- 交互：复制（copyToClipboard）、三反引号自动闭合（splitCodeBlockOnTripleBackticks）。
- Mermaid：通过 CodeFence 插件扩展，当 language 为 mermaid 时渲染流程/图表（extensions/Mermaid）。

2) 表格（Table）
- 语义：二维表格，支持表头、单元格、行/列编辑。
- 节点：Table.ts、TableHeader.ts、TableRow.ts、TableCell.ts、TableView.ts

3) 数学公式（Math/MathBlock）
- 语义：内联与块级数学公式，KaTeX 渲染。
- 节点：Math.ts、MathBlock.ts

4) 嵌入（Embeds）
- 一类：内置特定服务组件（shared/editor/embeds/*）。当前仓库包含：
  - YouTube、Vimeo、Spotify、Trello、Gist、GitLabSnippet、JSFiddle、Dropbox、InVision、Pinterest、Linkedin、Berrycast、Diagrams 等。
- 二类：通用外链展开（Unfurl）
  - 由 plugins/iframely 提供 UnfurlProvider，通过 Iframely API 抽取 oEmbed/元数据。
  - 包括 Airtable 在内的众多站点可通过 Iframely 实现卡片式嵌入（需配置 IFRAMELY_URL 和/或 IFRAMELY_API_KEY）。
- 节点：shared/editor/nodes/Embed.tsx 作为嵌入容器；具体服务在 embeds/*.tsx 中注册或由 Unfurl 自动处理。

5) 图片与视频（Images & Video）
- 语义：插入与展示媒体，支持标题/缩放/对齐（视实现而定）。
- 节点：Image.tsx、SimpleImage.tsx、Video.tsx
- 存储：走附件上传（见“附件与上传”）。

6) 附件与文件上传（Attachments & Uploads）
- 语义：向团队空间上传文件并关联到文档（可作为图片/文件链接等插入）。
- 模型：server/models/Attachment.ts（key、contentType、size、acl、expiresAt）
- API：server/routes/api/attachments/attachments.ts
  - attachments.create：获取预签名表单（presigned post），返回 uploadUrl + 表单字段 + attachment 元数据；文档附件使用 redirectUrl。
  - attachments.createFromUrl：从外链拉取并保存为文档附件（仅 preset=DocumentAttachment）。
  - attachments.list：按 user/document 过滤附件列表。
- 存储：server/storage/files（S3 兼容），AttachmentHelper 负责 key/ACL/大小限制与过期策略。

7) 提及与交互（Mentions, Tasks, HR, Blockquote 等）
- 提及（Mention.tsx）：@用户/文档等，渲染交互引用。
- 任务（tasks 概览）：由 ProsemirrorHelper.getTasksSummary 汇总复选项（CheckboxList/CheckboxItem）。
- 其他：段落、标题、引用、分隔线、表情、横线等常规节点（Paragraph/Heading/Blockquote/HorizontalRule/Emoji/HardBreak）。


六、数据与协作语义（Data & Collaboration）
- content（JSONB）与 state（BLOB）
  - content：最新一次保存的 ProseMirror 快照；读取渲染优先。
  - state：协作状态，较大；仅在 content 不可用时作为回退读取。
- 版本（Revision）：每次保存会累加 revisionCount，并可从任一 Revision 还原（restoreFromRevision）。
- 协作者（collaboratorIds）：在修改时合并写入，用于展示历史协作者。


七、导航与 URL（Navigation & URL）
- 路径：Document.getPath({ title, urlId }) → /doc/<slugified-title>-<urlId>
- 导航节点：toNavigationNode() 返回 {id,title,url,icon,color,children}，用于文集树。


八、与其他实体的关系（Relations）
- Collection：发布态文档属于某个文集，导航结构维护在集合上。
- Document 自关联：父子层级，迁移/还原时递归处理（archiveWithChildren / restoreWithChildren / findAllChildDocumentIds）。
- Attachment：文档可拥有多个附件（图片/文件等）。
- Comment/View/Star/Pin/Share：分别提供评论、浏览、个人收藏、置顶与分享能力。


九、实现与调试入口（Implementation Pointers）
- 查询带权限：Document.withMembershipScope(userId, { includeDrafts })
- 端点（部分）：server/routes/api/documents/*、server/routes/api/attachments/*、server/routes/api/shares/*
- 前端路由与渲染：app/routes/*、shared/editor/*


十、偏差与约束（Deviations & Constraints）
- text 字段已废弃，迁移中逐步移除；请优先使用 content/state 与 DocumentHelper。
- Iframely 未配置时，仅使用内置 embeds 列表；如需 Airtable/更多站点的卡片嵌入，请配置 IFRAMELY_URL 与 IFRAMELY_API_KEY。
