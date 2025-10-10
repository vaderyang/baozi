# Contacts & Organization 通讯录与组织管理功能设计方案

## 一、功能概述

为 Outline 增加 Contacts（联系人）和 Organization（组织）管理功能，作为知识库的辅助索引系统。该功能设计为低调内敛，不暴露在顶层导航，保持软件整体简约性。联系人和组织可以在文档中被引用和提及，并作为会议转录中的说话人（Speaker）角色。

## 二、设计原则

1. **低调集成**：不占用顶层导航，通过搜索、提及、设置等入口访问
2. **最小化影响**：复用现有的 Mention 机制和权限系统
3. **灵活引用**：可在文档中通过 @ 提及，作为知识索引
4. **角色扩展**：Contact 和 User 都可作为 Transcription 的 Speaker
5. **团队隔离**：数据按 Team 隔离，遵循现有多租户架构

## 三、数据模型设计

### 3.1 Organization 模型

```typescript
// server/models/Organization.ts
@Table({ tableName: "organizations", modelName: "organization" })
class Organization extends ParanoidModel {
  // 组织名称
  @Length({ max: 255 })
  @Column
  name: string;
  
  // 组织简称/缩写
  @Length({ max: 50 })
  @Column
  shortName: string | null;
  
  // 组织类型: company | department | partner | client | vendor | other
  @IsIn([['company', 'department', 'partner', 'client', 'vendor', 'other']])
  @Column
  type: string;
  
  // 组织描述
  @Column(DataType.TEXT)
  description: string | null;
  
  // 组织网站
  @Column
  website: string | null;
  
  // 组织 Logo URL
  @Column
  logoUrl: string | null;
  
  // 组织元数据
  @Column(DataType.JSONB)
  metadata: {
    industry?: string;
    size?: string;
    location?: string;
    tags?: string[];
  };
  
  // 父组织（支持层级结构）
  @ForeignKey(() => Organization)
  @Column(DataType.UUID)
  parentOrganizationId: string | null;
  
  @BelongsTo(() => Organization, "parentOrganizationId")
  parentOrganization: Organization | null;
  
  // 关联
  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;
  
  @BelongsTo(() => Team, "teamId")
  team: Team;
  
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;
  
  @BelongsTo(() => User, "createdById")
  createdBy: User;
  
  // 关联的联系人
  @HasMany(() => Contact, "organizationId")
  contacts: Contact[];
}
```

### 3.2 Contact 模型

```typescript
// server/models/Contact.ts
@Table({ tableName: "contacts", modelName: "contact" })
class Contact extends ParanoidModel {
  // 联系人姓名
  @Length({ max: 255 })
  @Column
  name: string;
  
  // 职位/角色
  @Length({ max: 255 })
  @Column
  title: string | null;
  
  // 邮箱
  @IsEmail
  @Column
  email: string | null;
  
  // 电话
  @Column
  phone: string | null;
  
  // 头像 URL
  @Column
  avatarUrl: string | null;
  
  // 联系人类型: external | internal
  @IsIn([['external', 'internal']])
  @Default('external')
  @Column
  type: string;
  
  // 备注
  @Column(DataType.TEXT)
  notes: string | null;
  
  // 联系人元数据
  @Column(DataType.JSONB)
  metadata: {
    linkedin?: string;
    twitter?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  };
  
  // 关联组织
  @ForeignKey(() => Organization)
  @Column(DataType.UUID)
  organizationId: string | null;
  
  @BelongsTo(() => Organization, "organizationId")
  organization: Organization | null;
  
  // 关联用户（如果是内部联系人）
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string | null;
  
  @BelongsTo(() => User, "userId")
  user: User | null;
  
  // 团队关联
  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;
  
  @BelongsTo(() => Team, "teamId")
  team: Team;
  
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;
  
  @BelongsTo(() => User, "createdById")
  createdBy: User;
}
```

### 3.3 DocumentMention 扩展

扩展现有的 Mention 系统以支持 Contact 和 Organization：

```typescript
// shared/types/index.ts
export enum MentionType {
  User = "user",
  Document = "document",
  Contact = "contact",           // 新增
  Organization = "organization",  // 新增
}

// 在 Mention 节点中支持新类型
interface MentionAttrs {
  type: MentionType;
  id: string;
  label: string;
  modelId: string;
}
```

### 3.4 数据库迁移

```sql
-- 创建 organizations 表
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  "shortName" VARCHAR(50),
  type VARCHAR(50) NOT NULL DEFAULT 'company',
  description TEXT,
  website VARCHAR(500),
  "logoUrl" VARCHAR(1000),
  metadata JSONB DEFAULT '{}',
  "parentOrganizationId" UUID REFERENCES organizations(id) ON DELETE SET NULL,
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_organizations_team ON organizations("teamId");
CREATE INDEX idx_organizations_parent ON organizations("parentOrganizationId");
CREATE INDEX idx_organizations_name ON organizations(name);

-- 创建 contacts 表
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  "avatarUrl" VARCHAR(1000),
  type VARCHAR(50) NOT NULL DEFAULT 'external',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  "organizationId" UUID REFERENCES organizations(id) ON DELETE SET NULL,
  "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_contacts_team ON contacts("teamId");
CREATE INDEX idx_contacts_organization ON contacts("organizationId");
CREATE INDEX idx_contacts_user ON contacts("userId");
CREATE INDEX idx_contacts_name ON contacts(name);
CREATE INDEX idx_contacts_email ON contacts(email);

-- 创建文档-联系人关联表（用于追踪文档中提及的联系人）
CREATE TABLE document_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "documentId" UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  "contactId" UUID REFERENCES contacts(id) ON DELETE CASCADE,
  "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_contact_or_org CHECK (
    ("contactId" IS NOT NULL AND "organizationId" IS NULL) OR
    ("contactId" IS NULL AND "organizationId" IS NOT NULL)
  )
);

CREATE INDEX idx_document_contacts_document ON document_contacts("documentId");
CREATE INDEX idx_document_contacts_contact ON document_contacts("contactId");
CREATE INDEX idx_document_contacts_organization ON document_contacts("organizationId");
```

## 四、前端实现

### 4.1 Store 实现

```typescript
// app/stores/ContactsStore.ts
class ContactsStore extends BaseStore<Contact> {
  @action
  fetchByOrganization = async (organizationId: string) => {
    const res = await client.post("/api/contacts.list", {
      organizationId,
    });
    runInAction("ContactsStore#fetchByOrganization", () => {
      res.data.forEach(this.add);
    });
    return res.data;
  };
}

// app/stores/OrganizationsStore.ts
class OrganizationsStore extends BaseStore<Organization> {
  @computed
  get tree(): Organization[] {
    // 构建组织层级树
    return this.orderedData.filter(org => !org.parentOrganizationId);
  }
}
```

### 4.2 编辑器 Mention 扩展

扩展现有的 Mention 节点以支持 Contact 和 Organization：

```typescript
// shared/editor/nodes/Mention.tsx
export default class Mention extends Node {
  get schema(): NodeSpec {
    return {
      attrs: {
        type: { default: "user" },
        id: {},
        label: {},
        modelId: {},
      },
      // ... 其他配置
    };
  }
  
  component = (props: ComponentProps) => {
    const { type, id, label } = props.node.attrs;
    
    // 根据类型渲染不同的样式
    switch (type) {
      case "contact":
        return <ContactMention id={id} label={label} />;
      case "organization":
        return <OrganizationMention id={id} label={label} />;
      default:
        return <UserMention id={id} label={label} />;
    }
  };
}
```

### 4.3 Mention 建议菜单扩展

```typescript
// app/editor/components/SuggestionsMenu.tsx
const fetchSuggestions = async (query: string) => {
  const results = [];
  
  // 搜索用户
  const users = await stores.users.search(query);
  results.push(...users.map(u => ({
    type: "user",
    id: u.id,
    label: u.name,
    avatar: u.avatarUrl,
  })));
  
  // 搜索联系人
  const contacts = await stores.contacts.search(query);
  results.push(...contacts.map(c => ({
    type: "contact",
    id: c.id,
    label: c.name,
    subtitle: c.organization?.name,
    avatar: c.avatarUrl,
  })));
  
  // 搜索组织
  const organizations = await stores.organizations.search(query);
  results.push(...organizations.map(o => ({
    type: "organization",
    id: o.id,
    label: o.name,
    subtitle: o.type,
    avatar: o.logoUrl,
  })));
  
  return results;
};
```

### 4.4 UI 入口设计（低调集成）

不在顶层导航暴露，通过以下方式访问：

1. **设置页面**：Settings > Contacts & Organizations
2. **全局搜索**：搜索结果中包含联系人和组织
3. **文档侧边栏**：显示文档中提及的联系人/组织
4. **快捷命令**：Cmd+K 打开命令面板，输入 "contacts" 或 "organizations"

```typescript
// app/scenes/Settings/Contacts.tsx
const ContactsSettings: React.FC = () => {
  return (
    <SettingsLayout>
      <Tabs>
        <Tab name="contacts">联系人</Tab>
        <Tab name="organizations">组织</Tab>
      </Tabs>
      
      <ContactsList />
      <OrganizationsList />
    </SettingsLayout>
  );
};
```

### 4.5 文档侧边栏集成

在文档侧边栏显示相关联系人和组织：

```typescript
// app/components/DocumentSidebar.tsx
const DocumentSidebar: React.FC = ({ document }) => {
  const contacts = useDocumentContacts(document.id);
  const organizations = useDocumentOrganizations(document.id);
  
  return (
    <Sidebar>
      {/* 现有内容 */}
      
      {(contacts.length > 0 || organizations.length > 0) && (
        <Section>
          <SectionTitle>相关联系人</SectionTitle>
          {contacts.map(contact => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
          {organizations.map(org => (
            <OrganizationCard key={org.id} organization={org} />
          ))}
        </Section>
      )}
    </Sidebar>
  );
};
```

## 五、后端实现

### 5.1 API 路由

```typescript
// server/routes/api/contacts/contacts.ts
router.post("contacts.create", auth(), async (ctx) => {
  const { name, title, email, organizationId, type } = ctx.input.body;
  
  const contact = await Contact.create({
    name,
    title,
    email,
    organizationId,
    type,
    teamId: ctx.state.user.teamId,
    createdById: ctx.state.user.id,
  });
  
  ctx.body = { data: present(contact) };
});

router.post("contacts.list", auth(), async (ctx) => {
  const { organizationId, query } = ctx.input.body;
  
  const where: any = {
    teamId: ctx.state.user.teamId,
  };
  
  if (organizationId) {
    where.organizationId = organizationId;
  }
  
  if (query) {
    where.name = { [Op.iLike]: `%${query}%` };
  }
  
  const contacts = await Contact.findAll({
    where,
    include: [{ model: Organization, as: "organization" }],
    order: [["name", "ASC"]],
  });
  
  ctx.body = { data: contacts.map(present) };
});

router.post("contacts.info", auth(), async (ctx) => {
  const { id } = ctx.input.body;
  const contact = await Contact.findByPk(id, {
    include: [
      { model: Organization, as: "organization" },
      { model: User, as: "user" },
    ],
  });
  
  authorize(ctx.state.user, "read", contact);
  
  ctx.body = { data: present(contact) };
});

// server/routes/api/organizations/organizations.ts
router.post("organizations.create", auth(), async (ctx) => {
  const { name, type, description, parentOrganizationId } = ctx.input.body;
  
  const organization = await Organization.create({
    name,
    type,
    description,
    parentOrganizationId,
    teamId: ctx.state.user.teamId,
    createdById: ctx.state.user.id,
  });
  
  ctx.body = { data: present(organization) };
});

router.post("organizations.list", auth(), async (ctx) => {
  const organizations = await Organization.findAll({
    where: { teamId: ctx.state.user.teamId },
    include: [
      { model: Organization, as: "parentOrganization" },
      { model: Contact, as: "contacts" },
    ],
    order: [["name", "ASC"]],
  });
  
  ctx.body = { data: organizations.map(present) };
});
```

### 5.2 搜索集成

扩展全局搜索以包含联系人和组织：

```typescript
// server/routes/api/search/search.ts
router.post("search.all", auth(), async (ctx) => {
  const { query } = ctx.input.body;
  
  // 现有搜索逻辑...
  
  // 搜索联系人
  const contacts = await Contact.findAll({
    where: {
      teamId: ctx.state.user.teamId,
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } },
        { title: { [Op.iLike]: `%${query}%` } },
      ],
    },
    limit: 5,
  });
  
  // 搜索组织
  const organizations = await Organization.findAll({
    where: {
      teamId: ctx.state.user.teamId,
      name: { [Op.iLike]: `%${query}%` },
    },
    limit: 5,
  });
  
  ctx.body = {
    data: {
      documents: [...],
      contacts: contacts.map(present),
      organizations: organizations.map(present),
    },
  };
});
```

### 5.3 文档关联追踪

自动追踪文档中提及的联系人和组织：

```typescript
// server/commands/documentUpdater.ts
class DocumentUpdater {
  async perform() {
    // 现有更新逻辑...
    
    // 提取文档中的 mentions
    await this.updateDocumentMentions();
  }
  
  private async updateDocumentMentions() {
    const mentions = this.extractMentions(this.document.content);
    
    // 删除旧的关联
    await DocumentContact.destroy({
      where: { documentId: this.document.id },
    });
    
    // 创建新的关联
    const contactMentions = mentions.filter(m => m.type === "contact");
    const orgMentions = mentions.filter(m => m.type === "organization");
    
    await DocumentContact.bulkCreate([
      ...contactMentions.map(m => ({
        documentId: this.document.id,
        contactId: m.id,
      })),
      ...orgMentions.map(m => ({
        documentId: this.document.id,
        organizationId: m.id,
      })),
    ]);
  }
  
  private extractMentions(content: ProsemirrorData): Mention[] {
    const mentions: Mention[] = [];
    
    const traverse = (node: any) => {
      if (node.type === "mention") {
        mentions.push({
          type: node.attrs.type,
          id: node.attrs.modelId,
        });
      }
      
      if (node.content) {
        node.content.forEach(traverse);
      }
    };
    
    traverse(content);
    return mentions;
  }
}
```

## 六、权限策略

```typescript
// server/policies/contact.ts
export default class ContactPolicy {
  static async read(user: User, contact: Contact): Promise<boolean> {
    // 同团队成员可读
    return contact.teamId === user.teamId;
  }
  
  static async create(user: User): Promise<boolean> {
    // Member 及以上角色可创建
    return ["admin", "member"].includes(user.role);
  }
  
  static async update(user: User, contact: Contact): Promise<boolean> {
    // 创建者或管理员可更新
    return (
      contact.createdById === user.id ||
      user.isAdmin
    );
  }
  
  static async delete(user: User, contact: Contact): Promise<boolean> {
    // 创建者或管理员可删除
    return (
      contact.createdById === user.id ||
      user.isAdmin
    );
  }
}

// server/policies/organization.ts
export default class OrganizationPolicy {
  // 与 ContactPolicy 类似
}
```

## 七、与会议转录集成（Speaker 识别）

### 7.1 Speaker 模型设计

Contact 和 User 都可以作为 Transcription 的 Speaker：

```typescript
// 在 Transcription 模型中添加 speakers 字段
@Column(DataType.JSONB)
speakers: Array<{
  id: string;                    // Speaker 唯一标识
  type: 'user' | 'contact';      // Speaker 类型
  modelId: string;               // User.id 或 Contact.id
  label: string;                 // 显示名称
  segments: Array<{              // 该说话人的发言片段
    start: number;
    end: number;
    text: string;
  }>;
}>;
```

### 7.2 Speaker 识别与映射 UI

在转录完成后，提供 UI 让用户映射识别出的说话人：

```typescript
// app/components/TranscriptionSpeakerMapping.tsx
const TranscriptionSpeakerMapping: React.FC = ({ transcription }) => {
  const [speakerMappings, setSpeakerMappings] = useState<Map<string, Speaker>>();
  
  // 自动识别的说话人列表（如 Speaker 1, Speaker 2）
  const detectedSpeakers = transcription.metadata.speakers || [];
  
  return (
    <Modal>
      <h2>识别会议参与者</h2>
      {detectedSpeakers.map((speaker, index) => (
        <SpeakerRow key={index}>
          <span>说话人 {index + 1}</span>
          <SpeakerSelector
            value={speakerMappings.get(speaker.id)}
            onChange={(selected) => {
              setSpeakerMappings(prev => 
                new Map(prev).set(speaker.id, selected)
              );
            }}
            options={[
              // 当前团队用户
              ...users.map(u => ({ type: 'user', id: u.id, label: u.name })),
              // 联系人
              ...contacts.map(c => ({ type: 'contact', id: c.id, label: c.name })),
            ]}
          />
        </SpeakerRow>
      ))}
      <Button onClick={saveMappings}>保存</Button>
    </Modal>
  );
};
```

### 7.3 转录内容格式化

根据 Speaker 映射格式化转录内容：

```typescript
// server/queues/processors/TranscriptionProcessor.ts
private static formatTranscriptionWithSpeakers(
  result: TranscriptionResult,
  speakerMappings: Map<string, Speaker>
): ProsemirrorData {
  const content = [];
  
  // 标题
  content.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "会议纪要" }],
  });
  
  // 元信息
  content.push({
    type: "paragraph",
    content: [
      { type: "text", text: `时间: ${new Date().toLocaleString()}` },
    ],
  });
  
  // 参与者列表
  if (speakerMappings.size > 0) {
    content.push({
      type: "paragraph",
      content: [
        { type: "text", text: "参与者: ", marks: [{ type: "strong" }] },
        ...Array.from(speakerMappings.values()).flatMap((speaker, i) => [
          {
            type: "mention",
            attrs: {
              type: speaker.type,
              id: speaker.id,
              modelId: speaker.modelId,
              label: speaker.label,
            },
          },
          { type: "text", text: i < speakerMappings.size - 1 ? ", " : "" },
        ]),
      ],
    });
  }
  
  // 对话内容
  result.segments.forEach(segment => {
    const speaker = speakerMappings.get(segment.speakerId);
    
    content.push({
      type: "paragraph",
      content: [
        // 说话人标识
        speaker ? {
          type: "mention",
          attrs: {
            type: speaker.type,
            id: speaker.id,
            modelId: speaker.modelId,
            label: speaker.label,
          },
        } : {
          type: "text",
          text: `说话人 ${segment.speakerId}`,
          marks: [{ type: "strong" }],
        },
        { type: "text", text: ": " },
        { type: "text", text: segment.text },
      ],
    });
  });
  
  return {
    type: "doc",
    content,
  };
}
```

## 八、使用场景示例

### 8.1 会议纪要场景

1. 用户录制会议音频
2. 转录服务识别出 3 个说话人（Speaker 1, 2, 3）
3. 用户在映射界面中：
   - Speaker 1 → 映射到 User "张三"（团队成员）
   - Speaker 2 → 映射到 Contact "李四"（外部客户）
   - Speaker 3 → 映射到 Contact "王五"（合作伙伴）
4. 生成的文档自动包含 @张三、@李四、@王五 的提及
5. 在文档侧边栏显示相关联系人

### 8.2 客户管理场景

1. 创建组织 "ABC 公司"
2. 在该组织下添加联系人：
   - 张经理（CEO）
   - 李工程师（CTO）
3. 在项目文档中 @ABC公司、@张经理
4. 通过搜索 "ABC" 可以找到：
   - 组织记录
   - 相关联系人
   - 提及该组织的所有文档

### 8.3 知识索引场景

1. 在技术文档中提及 @某技术专家（Contact）
2. 在合作协议中提及 @合作伙伴公司（Organization）
3. 通过联系人/组织页面查看：
   - 该联系人/组织的基本信息
   - 提及该联系人/组织的所有文档
   - 相关的会议纪要

## 九、数据导入与集成

### 9.1 CSV 导入

支持从 CSV 批量导入联系人：

```typescript
// server/routes/api/contacts/import.ts
router.post("contacts.import", auth(), async (ctx) => {
  const { csvData } = ctx.input.body;
  
  const contacts = parseCSV(csvData);
  
  const created = await Contact.bulkCreate(
    contacts.map(c => ({
      ...c,
      teamId: ctx.state.user.teamId,
      createdById: ctx.state.user.id,
    }))
  );
  
  ctx.body = { data: created.map(present) };
});
```

### 9.2 与外部系统集成

预留集成接口，未来可对接：
- CRM 系统（Salesforce, HubSpot）
- 通讯录服务（Google Contacts, Microsoft Graph）
- 企业目录（LDAP, Active Directory）

```typescript
// plugins/crm-integration/server/sync.ts
export class CRMSyncService {
  async syncContacts(teamId: string) {
    // 从 CRM 同步联系人
  }
}
```

## 十、UI/UX 设计原则

### 10.1 低调集成

- **不占用顶层导航**：避免增加认知负担
- **按需显示**：只在相关场景下显示联系人/组织信息
- **渐进式披露**：基础功能简单，高级功能隐藏在二级菜单

### 10.2 访问路径

```
主要入口：
1. 设置 > Contacts & Organizations
2. 全局搜索（Cmd+K）> 输入联系人/组织名称
3. 文档侧边栏 > 相关联系人
4. @ 提及菜单 > 联系人/组织选项

次要入口：
5. 会议转录 > Speaker 映射界面
6. 文档反向链接 > 显示提及该联系人的文档
```

### 10.3 视觉设计

- Contact 使用圆形头像 + 姓名
- Organization 使用方形 Logo + 名称
- 在 Mention 中使用不同颜色区分类型：
  - User: 蓝色
  - Contact: 绿色
  - Organization: 橙色

## 十一、性能优化

### 11.1 搜索优化

```sql
-- 全文搜索索引
CREATE INDEX idx_contacts_search ON contacts 
  USING gin(to_tsvector('simple', name || ' ' || COALESCE(email, '') || ' ' || COALESCE(title, '')));

CREATE INDEX idx_organizations_search ON organizations 
  USING gin(to_tsvector('simple', name || ' ' || COALESCE(description, '')));
```

### 11.2 缓存策略

```typescript
// 缓存常用联系人列表
const CACHE_KEY = `team:${teamId}:contacts:recent`;
await redis.setex(CACHE_KEY, 3600, JSON.stringify(contacts));
```

### 11.3 懒加载

- 联系人列表分页加载（每页 50 条）
- 组织树按需展开子节点
- 文档侧边栏的联系人信息按需加载

## 十二、测试策略

### 12.1 单元测试

```typescript
// server/models/Contact.test.ts
describe("Contact", () => {
  it("should create contact with organization", async () => {
    const org = await factory.create("Organization");
    const contact = await Contact.create({
      name: "张三",
      organizationId: org.id,
      teamId: team.id,
      createdById: user.id,
    });
    
    expect(contact.organizationId).toBe(org.id);
  });
  
  it("should link contact to user for internal contacts", async () => {
    const contact = await Contact.create({
      name: user.name,
      type: "internal",
      userId: user.id,
      teamId: team.id,
      createdById: user.id,
    });
    
    expect(contact.userId).toBe(user.id);
  });
});
```

### 12.2 集成测试

```typescript
// server/routes/api/contacts/contacts.test.ts
describe("#contacts.create", () => {
  it("should create contact and return data", async () => {
    const res = await server.post("/api/contacts.create", {
      body: {
        name: "李四",
        email: "lisi@example.com",
        organizationId: organization.id,
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("李四");
  });
});
```

## 十三、迁移与部署

### 13.1 数据迁移

```bash
# 创建迁移
yarn sequelize migration:create --name add-contacts-and-organizations

# 运行迁移
yarn sequelize db:migrate
```

### 13.2 功能开关

```typescript
// server/models/Team.ts
preferences: {
  features: {
    contacts: boolean;  // 默认 true
  }
}
```

### 13.3 向后兼容

- 现有 Mention 系统继续工作
- 新增的 Contact/Organization Mention 对旧版本客户端降级为纯文本

## 十四、总结

本方案通过以下方式实现最小化架构影响：

1. **复用现有机制**
   - 扩展 Mention 系统而非创建新的引用机制
   - 使用现有的权限策略模式
   - 利用现有的搜索基础设施

2. **低调设计**
   - 不占用顶层导航
   - 通过设置、搜索、侧边栏等现有入口访问
   - 保持软件整体简约性

3. **独立模块**
   - Contact 和 Organization 作为独立实体
   - 可通过功能开关启用/禁用
   - 不影响核心文档功能

4. **灵活扩展**
   - 支持与会议转录的 Speaker 识别集成
   - 预留外部系统集成接口
   - 支持自定义字段和元数据

5. **性能考虑**
   - 全文搜索索引
   - 缓存策略
   - 懒加载和分页

该方案为 Outline 提供了一个轻量级的联系人和组织管理系统，既满足了会议纪要中 Speaker 识别的需求，又可以作为知识库的辅助索引，帮助用户更好地组织和检索与人员、组织相关的知识内容。
