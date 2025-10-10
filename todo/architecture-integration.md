# Contacts & Transcription 架构集成图

本文档展示 Contacts/Organization 和 Meeting Transcription 两个功能如何在 Outline 架构中集成。

## 整体架构图

```mermaid
graph TB
    subgraph "Frontend (React + MobX)"
        Editor[Document Editor]
        Settings[Settings Page]
        Sidebar[Document Sidebar]
        Search[Global Search]
        
        Editor --> RecordBtn[Recording Button]
        Editor --> MentionMenu[@Mention Menu]
        Settings --> ContactsMgmt[Contacts Management]
        Settings --> OrgMgmt[Organizations Management]
    end
    
    subgraph "Shared (ProseMirror)"
        MentionNode[Mention Node]
        AudioNode[AudioTranscription Node]
        
        MentionNode --> |supports| UserMention[User Mention]
        MentionNode --> |supports| ContactMention[Contact Mention]
        MentionNode --> |supports| OrgMention[Organization Mention]
    end
    
    subgraph "Backend API (Koa)"
        ContactsAPI[/api/contacts.*]
        OrgsAPI[/api/organizations.*]
        TransAPI[/api/transcriptions.*]
        SearchAPI[/api/search.all]
        
        ContactsAPI --> ContactModel[(Contact Model)]
        OrgsAPI --> OrgModel[(Organization Model)]
        TransAPI --> TransModel[(Transcription Model)]
    end
    
    subgraph "Queue System (Bull)"
        TransQueue[Transcription Queue]
        TransProcessor[Transcription Processor]
        
        TransQueue --> TransProcessor
    end
    
    subgraph "External Services"
        WhisperAPI[OpenAI Whisper API]
        AzureSpeech[Azure Speech Service]
        
        TransProcessor --> |transcribe| WhisperAPI
        TransProcessor --> |speaker diarization| AzureSpeech
    end
    
    subgraph "Database (PostgreSQL)"
        Users[(users)]
        Contacts[(contacts)]
        Orgs[(organizations)]
        Docs[(documents)]
        Trans[(transcriptions)]
        Attachments[(attachments)]
        DocContacts[(document_contacts)]
        
        Contacts --> |belongs to| Orgs
        Contacts --> |optional link| Users
        Trans --> |references| Attachments
        Trans --> |belongs to| Docs
        DocContacts --> |links| Docs
        DocContacts --> |links| Contacts
        DocContacts --> |links| Orgs
    end
    
    subgraph "Storage (S3)"
        AudioFiles[Audio Files]
    end
    
    RecordBtn --> |upload| TransAPI
    MentionMenu --> |search| ContactsAPI
    MentionMenu --> |search| OrgsAPI
    ContactsMgmt --> ContactsAPI
    OrgMgmt --> OrgsAPI
    TransAPI --> TransQueue
    TransProcessor --> |save result| Trans
    Attachments --> |stored in| AudioFiles
    Search --> SearchAPI
    SearchAPI --> |query| Contacts
    SearchAPI --> |query| Orgs
    
    style MentionNode fill:#e1f5ff
    style AudioNode fill:#e1f5ff
    style TransProcessor fill:#fff4e1
    style WhisperAPI fill:#ffe1e1
    style AzureSpeech fill:#ffe1e1
```

## 数据流图

### 1. 会议转录 + Speaker 映射流程

```mermaid
sequenceDiagram
    participant User
    participant Editor
    participant API
    participant Queue
    participant Transcription Service
    participant SpeakerUI
    participant ContactsAPI
    
    User->>Editor: 点击录音按钮
    Editor->>Editor: 开始录音
    User->>Editor: 停止录音
    Editor->>API: POST /api/attachments.create
    API-->>Editor: 返回 attachment
    Editor->>API: POST /api/transcriptions.create
    API->>Queue: 加入转录队列
    API-->>Editor: 返回 transcription (pending)
    
    Queue->>Transcription Service: 处理音频
    Transcription Service->>Transcription Service: 转录 + 说话人识别
    Transcription Service-->>Queue: 返回结果
    Queue->>API: 更新状态为 speaker_mapping
    API->>Editor: WebSocket 推送事件
    
    Editor->>SpeakerUI: 显示 Speaker 映射界面
    SpeakerUI->>ContactsAPI: 获取候选人列表
    ContactsAPI-->>SpeakerUI: 返回 Users + Contacts
    User->>SpeakerUI: 映射 Speaker 1 → Contact "李四"
    User->>SpeakerUI: 映射 Speaker 2 → User "张三"
    SpeakerUI->>API: POST /api/transcriptions.mapSpeakers
    API->>API: 生成带 Mention 的内容
    API->>API: 更新状态为 completed
    API->>Editor: WebSocket 推送完成事件
    Editor->>Editor: 插入格式化的会议纪要
```

### 2. 文档中提及联系人流程

```mermaid
sequenceDiagram
    participant User
    participant Editor
    participant MentionMenu
    participant API
    participant DB
    
    User->>Editor: 输入 "@"
    Editor->>MentionMenu: 打开提及菜单
    User->>MentionMenu: 输入 "李"
    MentionMenu->>API: 搜索 Users + Contacts
    API->>DB: 查询匹配项
    DB-->>API: 返回结果
    API-->>MentionMenu: 返回候选列表
    MentionMenu-->>User: 显示候选项
    User->>MentionMenu: 选择 Contact "李四"
    MentionMenu->>Editor: 插入 Mention 节点
    Editor->>API: 保存文档
    API->>DB: 更新 document.content
    API->>DB: 创建 document_contacts 关联
    DB-->>API: 完成
    API-->>Editor: 保存成功
```

## 实体关系图（ER Diagram）

```mermaid
erDiagram
    Team ||--o{ User : has
    Team ||--o{ Contact : has
    Team ||--o{ Organization : has
    Team ||--o{ Document : has
    Team ||--o{ Transcription : has
    
    Organization ||--o{ Contact : contains
    Organization }o--o| Organization : parent_child
    
    Contact }o--o| User : optional_link
    
    Document ||--o{ Transcription : has
    Document ||--o{ DocumentContact : mentioned_in
    
    DocumentContact }o--|| Contact : references
    DocumentContact }o--|| Organization : references
    
    Transcription ||--|| Attachment : audio_file
    Transcription ||--o{ Speaker : identifies
    
    Speaker }o--o| User : mapped_to
    Speaker }o--o| Contact : mapped_to
    
    User {
        uuid id PK
        string name
        string email
        string role
    }
    
    Contact {
        uuid id PK
        string name
        string email
        string title
        uuid organizationId FK
        uuid userId FK
        uuid teamId FK
    }
    
    Organization {
        uuid id PK
        string name
        string type
        uuid parentOrganizationId FK
        uuid teamId FK
    }
    
    Document {
        uuid id PK
        string title
        jsonb content
        uuid teamId FK
    }
    
    Transcription {
        uuid id PK
        string status
        jsonb content
        jsonb speakers
        uuid attachmentId FK
        uuid documentId FK
        uuid teamId FK
    }
    
    DocumentContact {
        uuid id PK
        uuid documentId FK
        uuid contactId FK
        uuid organizationId FK
    }
    
    Attachment {
        uuid id PK
        string key
        string contentType
        uuid teamId FK
    }
```

## 组件交互图

### 前端组件层次

```
App
├── DocumentEditor
│   ├── ProseMirror
│   │   ├── MentionNode (扩展支持 Contact/Org)
│   │   └── AudioTranscriptionNode (新增)
│   ├── SlashMenu
│   │   └── RecordingCommand (新增)
│   └── MentionSuggestions
│       ├── UserSuggestions
│       ├── ContactSuggestions (新增)
│       └── OrganizationSuggestions (新增)
├── DocumentSidebar
│   ├── RelatedContacts (新增)
│   └── RelatedOrganizations (新增)
├── Settings
│   ├── ContactsManagement (新增)
│   └── OrganizationsManagement (新增)
├── Modals
│   └── SpeakerMappingModal (新增)
└── GlobalSearch
    ├── DocumentResults
    ├── ContactResults (新增)
    └── OrganizationResults (新增)
```

### Store 层次

```
RootStore
├── UsersStore (现有)
├── DocumentsStore (现有)
├── ContactsStore (新增)
│   ├── orderedData: Contact[]
│   ├── search(query): Contact[]
│   └── fetchByOrganization(orgId): Contact[]
├── OrganizationsStore (新增)
│   ├── orderedData: Organization[]
│   ├── tree: Organization[] (层级结构)
│   └── search(query): Organization[]
└── TranscriptionsStore (新增)
    ├── orderedData: Transcription[]
    ├── create(attachmentId, documentId): Transcription
    ├── mapSpeakers(id, mappings): void
    └── handleTranscriptionCompleted(event): void
```

## API 路由结构

```
/api
├── contacts
│   ├── contacts.create
│   ├── contacts.list
│   ├── contacts.info
│   ├── contacts.update
│   ├── contacts.delete
│   ├── contacts.search
│   └── contacts.import (CSV)
├── organizations
│   ├── organizations.create
│   ├── organizations.list
│   ├── organizations.info
│   ├── organizations.update
│   ├── organizations.delete
│   └── organizations.search
├── transcriptions
│   ├── transcriptions.create
│   ├── transcriptions.status
│   ├── transcriptions.mapSpeakers (新增)
│   ├── transcriptions.delete
│   └── transcriptions.list
└── search
    └── search.all (扩展支持 Contact/Org)
```

## 权限策略

```typescript
// 权限继承关系
DocumentPolicy
    ├── read → TranscriptionPolicy.read
    └── update → TranscriptionPolicy.create

TeamPolicy
    ├── member → ContactPolicy.create
    ├── member → OrganizationPolicy.create
    └── admin → ContactPolicy.delete

ContactPolicy
    ├── read (同团队可读)
    ├── create (Member+)
    ├── update (创建者或 Admin)
    └── delete (创建者或 Admin)

OrganizationPolicy
    └── (同 ContactPolicy)
```

## 事件流

```mermaid
graph LR
    subgraph "Document Events"
        DocSave[document.save]
        DocUpdate[document.update]
    end
    
    subgraph "Transcription Events"
        TransCreate[transcription.create]
        TransProcess[transcription.processing]
        TransMap[transcription.speaker_mapping]
        TransComplete[transcription.completed]
    end
    
    subgraph "Contact Events"
        ContactCreate[contact.create]
        ContactUpdate[contact.update]
    end
    
    DocSave --> |extract mentions| DocUpdate
    DocUpdate --> |create| DocContactLink[document_contacts]
    
    TransCreate --> |enqueue| TransProcess
    TransProcess --> |detect speakers| TransMap
    TransMap --> |user maps| TransComplete
    TransComplete --> |insert content| DocSave
    
    ContactCreate --> |notify| WebSocket[WebSocket Push]
    TransComplete --> |notify| WebSocket
```

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│  Web Server  │  │ Web Server  │  │ Web Server  │
│   (Koa)      │  │   (Koa)     │  │   (Koa)     │
└───────┬──────┘  └──────┬──────┘  └──────┬──────┘
        │                │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│  PostgreSQL  │  │    Redis    │  │  S3 Storage │
│  (Database)  │  │   (Queue)   │  │   (Audio)   │
└──────────────┘  └──────┬──────┘  └─────────────┘
                          │
                  ┌───────▼───────┐
                  │ Worker Process│
                  │ (Transcription│
                  │  Processor)   │
                  └───────┬───────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│OpenAI Whisper│  │Azure Speech │  │Google Speech│
│     API      │  │   Service   │  │     API     │
└──────────────┘  └─────────────┘  └─────────────┘
```

## 扩展性考虑

### 水平扩展
- Web 服务器：无状态，可任意扩展
- Worker 进程：通过 Redis 队列协调，可独立扩展
- 数据库：读写分离，主从复制

### 性能优化
- 联系人列表：分页 + 虚拟滚动
- 搜索：全文索引 + Redis 缓存
- 转录队列：优先级队列，短音频优先

### 监控指标
- 转录成功率
- 平均转录时长
- 队列积压情况
- API 响应时间
- 存储使用量

## 总结

这个集成架构展示了：

1. **模块化设计**：Contacts 和 Transcription 作为独立模块，通过 Speaker 映射集成
2. **复用现有基础设施**：Mention 系统、队列系统、存储系统
3. **清晰的数据流**：从录音到转录到映射到文档的完整流程
4. **可扩展性**：支持多种转录服务，支持外部系统集成
5. **性能优化**：异步处理、缓存策略、索引优化

该架构在不破坏 Outline 现有结构的前提下，优雅地集成了两个新功能，并为未来扩展预留了空间。
