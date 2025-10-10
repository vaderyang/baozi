# Document 斜杠（/）命令 Feature 实体定义

本文档定义在 Document 页面通过“/ 斜杠命令（Block Menu）”可插入的功能型实体（feature entities），并将其与编辑器节点（ProseMirror nodes）、前端命令、后端接口/插件进行语义映射。

实现位置（核心）：
- 触发与菜单
  - app/editor/extensions/BlockMenu.tsx（触发符号“/”，打开建议菜单）
  - app/editor/components/BlockMenu.tsx → app/editor/menus/block.tsx（标准功能项）
  - app/editor/components/SuggestionsMenu.tsx（搜索、选择、插入流程；附带文件选择/上传与粘贴链接触发）
- 嵌入（Embeds）
  - shared/editor/embeds/index.tsx（内置各类站点的 EmbedDescriptor；含 Airtable 等）
- 上传与占位
  - shared/editor/commands/insertFiles.ts（图片/视频/附件上传、占位符替换）
- 主要节点
  - shared/editor/nodes/*（code_fence、image、video、attachment、table、container_notice、math_block、hr 等）


一、定义视角（如何把“/项”阐述成实体）
- 名称（Name）：菜单显示名/语义名（如 Code Block、Airtable）
- 命令/节点（Command/Node）：触发的命令 key 或创建的节点类型名（ProseMirror node name）
- 关键属性（Attrs）：插入时可配置/携带的属性（如 language、rowsCount、style 等）
- 语义（Semantics）：该实体在文档内表达的含义与交互
- 实现映射（Impl Mapping）：对应到具体代码位置/后端接口/插件


二、标准实体清单与映射（节选）
为避免冗长，仅列出影响范围大、语义稳定、跨层实现耦合（节点+上传/后端）的实体类型。其它常规文本/格式化类功能见对应节点与菜单实现即可。

1) 代码块（Code Block / Fence）
- Command/Node：
  - 菜单项 name: "code_block"（app/editor/menus/block.tsx）
  - 实际节点：shared/editor/nodes/CodeFence.ts（name: code_fence；命令别名 code_block）
- Attrs：language（默认 javascript）；行号受用户偏好控制
- Semantics：代码编辑/高亮；支持复制、缩进、三反引号自动闭合；当 language=mermaidjs 时进入渲染图模式
- Impl Mapping：
  - 扩展高亮与 Mermaid：shared/editor/nodes/CodeFence.ts + extensions/Mermaid

2) 数学公式（Math Block）
- Node：math_block（shared/editor/nodes/MathBlock.ts）
- Semantics：KaTeX 渲染块级公式

3) 表格（Table）
- Node：table（Table.ts）与 table_* 子节点
- Attrs：rowsCount/colsCount/colWidth（插入初始大小）
- Semantics：二维表格编辑；配合选择工具条进行行列操作

4) 图片（Image）/ 视频（Video）/ 附件（Attachment）
- Nodes：image、video、attachment
- 插入路径：
  - 通过 “/ image”、“/ video”、“/ attachment” 或从菜单触发文件选择
  - app/editor/components/SuggestionsMenu.tsx → getEventFiles → insertFiles（shared/editor/commands/insertFiles.ts）
- Upload 语义：
  - 生成上传占位符 → 调用 props.uploadFile（外部实现通常走 server/routes/api/attachments/）→ 成功后以对应节点替换占位
  - image: { src,width,height }；video: { src,title,width,height }；attachment: { href,title,size }
- Backend：
  - server/routes/api/attachments/attachments.ts（create/createFromUrl/list 等）
  - server/models/Attachment.ts + storage（S3 兼容）

5) 引用块（Blockquote）/ 分隔线（Horizontal Rule / Page Break）
- Nodes：blockquote、hr（hr 可携带 attrs.markup="***" 表示页面分隔符）

6) 提示卡片（Notice / Callout）
- Node：container_notice（styles: info/success/warning/tip）
- Semantics：高亮提示内容容器

7) 列表（List）与任务清单（Task）
- Nodes：bullet_list、ordered_list、checkbox_list/checkbox_item
- Semantics：
  - 任务聚合：Document.tasks ← ProsemirrorHelper.getTasksSummary(document)

8) 标题（Heading 1-4）
- Node：heading（attrs: level 1..4）
- Semantics：结构性标题；影响文集导航中节点标题/图标展示（发布态）

9) 日期/时间（Date/Time/DateTime）
- Commands：menu item name: date/time/datetime（文本内联插入当前日期/时间/时间戳，具体行为由命令集映射）
- Semantics：快捷插入时间信息（用于轻量记录）

10) 嵌入（Embeds）
- Node：embed（shared/editor/nodes/Embed.tsx）
- 源项来源：
  - SuggestionsMenu 将 shared/editor/embeds/index.tsx 中的 EmbedDescriptor 合并到“/”菜单
  - 选择后弹出链接输入框，匹配 regexMatch → transformMatch 产出 iframe src 或使用自定义 component 渲染
- 典型：Airtable
  - Descriptor：shared/editor/embeds/index.tsx
  - 匹配：
    - https://airtable.com/(embed/)?(app…/)?(shr…)
    - https://airtable.com/(app…/)?(pag…)/form
  - transform：统一转为 https://airtable.com/embed/<app?>/<shr|pag…>
  - 语义：将 Airtable 视图/表单以安全 iframe 方式嵌入
- 其它：YouTube、Vimeo、Figma、Miro、Trello、Google Docs/Sheets/Slides/Forms 等（详见 descriptors）


三、行为与约束（Behavior & Constraints）
- 发布与导航：
  - 标题/图标/颜色变更在发布态下触发文集结构更新（Document.updateCollectionStructure）
- 授权继承：
  - 发布时从父文档复制成员/组授权到子文档（Document.publish → GroupMembership.copy/UserMembership.copy）
- 协作数据：
  - content（JSONB）为快照；state（BLOB）为 Yjs 协作状态，仅在必要时读取
- 上传大小与 ACL：
  - AttachmentHelper 统一控制 preset→maxSize/ACL/过期策略；服务端验证在 attachments 路由内
- 嵌入安全：
  - 大多数 embed 通过 transformMatch 生成目的 URL；如需统一外链 unfurl，可结合 plugins/iframely（可选）


四、维护指引（新增/调整“/”实体）
- 新增标准功能项：编辑 app/editor/menus/block.tsx，提供 name/title/icon/attrs/keywords 等；命令需在编辑器命令集中存在（Editor.extensions.commands）
- 新增嵌入站点：在 shared/editor/embeds/index.tsx 添加新的 EmbedDescriptor（匹配 regex 与 transform 规则，必要时提供 component）
- 调整上传策略：修改 shared/editor/commands/insertFiles.ts 或服务端 attachments 路由与存储实现
- 与本体联动：本文件与 ontology/document.md 中“内容模型与功能语义”互为补充；涉及权限/发布/导航的规则以 server/models/Document.ts 为准
