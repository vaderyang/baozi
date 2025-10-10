# 会议纪要听写转文本功能设计方案

## 一、功能概述

为 Outline 的 Document 实体增加会议录音转文本功能，允许用户在文档编辑器中直接录制或上传音频，自动转换为文本并插入到文档中。该功能旨在提升会议纪要的创建效率，减少手动记录的工作量。

## 二、设计原则

1. **最小化架构影响**：复用现有的 Attachment 模型和存储机制，不引入新的核心实体
2. **插件化设计**：作为可选插件实现，不影响核心功能
3. **渐进式增强**：功能可独立启用/禁用，不依赖时不影响现有功能
4. **兼容现有架构**：遵循 Outline 的 MobX + Sequelize + Plugin 架构模式

## 三、技术方案

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  Editor Extension (AudioRecorder Node)                       │
│  ├─ 录音控制组件 (RecordingControls)                         │
│  ├─ 音频上传组件 (AudioUploader)                             │
│  └─ 转录状态显示 (TranscriptionStatus)                       │
├─────────────────────────────────────────────────────────────┤
│                      Backend (Koa)                           │
├─────────────────────────────────────────────────────────────┤
│  API Routes                                                  │
│  ├─ /api/transcriptions.create                              │
│  ├─ /api/transcriptions.status                              │
│  └─ /api/transcriptions.result                              │
├─────────────────────────────────────────────────────────────┤
│  Queue Processor (Bull)                                      │
│  └─ TranscriptionProcessor                                   │
├─────────────────────────────────────────────────────────────┤
│  Plugin: transcription                                       │
│  ├─ Whisper API 集成 (OpenAI)                               │
│  ├─ 或其他 STT 服务 (Azure, Google Cloud)                   │
│  └─ 本地 Whisper 模型（可选）                                │
├─────────────────────────────────────────────────────────────┤
│  Storage (复用现有)                                          │
│  └─ Attachment 模型存储音频文件                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据模型设计

#### 3.2.1 复用 Attachment 模型

音频文件作为特殊类型的 Attachment 存储，通过 `contentType` 区分：
- `audio/webm`
- `audio/mp3`
- `audio/wav`
- `audio/m4a`

#### 3.2.2 新增 Transcription 模型

```typescript
// server/models/Transcription.ts
class Transcription extends IdModel {
  // 关联的音频附件
  attachmentId: string;
  
  // 关联的文档
  documentId: string;
  
  // 转录状态: pending | processing | speaker_mapping | completed | failed
  status: 'pending' | 'processing' | 'speaker_mapping' | 'completed' | 'failed';
  
  // 转录结果（ProseMirror JSON 格式）
  content: ProsemirrorData | null;
  
  // 原始文本（备用）
  text: string | null;
  
  // 说话人映射（用户手动映射后的结果）
  speakers: Array<{
    id: string;                    // Speaker 唯一标识（如 "speaker_1"）
    type: 'user' | 'contact' | null;  // 映射类型
    modelId: string | null;        // User.id 或 Contact.id
    label: string;                 // 显示名称
    segments: Array<{              // 该说话人的发言片段
      start: number;
      end: number;
      text: string;
    }>;
  }> | null;
  
  // 转录元数据
  metadata: {
    duration?: number;        // 音频时长（秒）
    language?: string;        // 检测到的语言
    confidence?: number;      // 置信度
    provider?: string;        // 使用的服务提供商
    timestamps?: Array<{      // 时间戳（可选）
      start: number;
      end: number;
      text: string;
    }>;
    // 原始说话人识别结果（未映射前）
    detectedSpeakers?: Array<{
      id: string;             // 如 "speaker_1", "speaker_2"
      segments: Array<{
        start: number;
        end: number;
        text: string;
      }>;
    }>;
  };
  
  // 错误信息
  error: string | null;
  
  // 关联
  teamId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3.2.3 数据库迁移

```sql
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "attachmentId" UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  "documentId" UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  content JSONB,
  text TEXT,
  speakers JSONB,  -- 说话人映射数据
  metadata JSONB DEFAULT '{}',
  error TEXT,
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcriptions_attachment ON transcriptions("attachmentId");
CREATE INDEX idx_transcriptions_document ON transcriptions("documentId");
CREATE INDEX idx_transcriptions_status ON transcriptions(status);
```

### 3.3 前端实现

#### 3.3.1 编辑器扩展

创建新的编辑器节点 `AudioTranscription`：

```typescript
// shared/editor/nodes/AudioTranscription.tsx
export default class AudioTranscription extends Node {
  get name() {
    return "audio-transcription";
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      atom: true,
      attrs: {
        attachmentId: { default: null },
        transcriptionId: { default: null },
        status: { default: "pending" },
        audioUrl: { default: null },
      },
      parseDOM: [
        {
          tag: "div[data-type='audio-transcription']",
          getAttrs: (dom: HTMLElement) => ({
            attachmentId: dom.getAttribute("data-attachment-id"),
            transcriptionId: dom.getAttribute("data-transcription-id"),
            status: dom.getAttribute("data-status"),
            audioUrl: dom.getAttribute("data-audio-url"),
          }),
        },
      ],
      toDOM: (node) => [
        "div",
        {
          "data-type": "audio-transcription",
          "data-attachment-id": node.attrs.attachmentId,
          "data-transcription-id": node.attrs.transcriptionId,
          "data-status": node.attrs.status,
          "data-audio-url": node.attrs.audioUrl,
        },
      ],
    };
  }

  component = (props: ComponentProps) => (
    <AudioTranscriptionComponent {...props} />
  );
}
```

#### 3.3.2 录音组件

```typescript
// app/components/AudioRecorder.tsx
const AudioRecorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      setAudioBlob(blob);
    };
    
    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const uploadAndTranscribe = async () => {
    // 1. 上传音频到 Attachment
    // 2. 创建 Transcription 记录
    // 3. 插入编辑器节点
  };

  return (
    <div>
      {!isRecording ? (
        <Button onClick={startRecording}>开始录音</Button>
      ) : (
        <Button onClick={stopRecording}>停止录音</Button>
      )}
      {audioBlob && (
        <Button onClick={uploadAndTranscribe}>转录</Button>
      )}
    </div>
  );
};
```

#### 3.3.3 编辑器菜单集成

在文档编辑器的斜杠菜单（slash menu）中添加录音选项：

```typescript
// app/editor/menus/block.tsx
{
  name: "audio-transcription",
  title: "会议录音",
  icon: <MicrophoneIcon />,
  keywords: "audio recording transcription meeting 录音 会议",
  shortcut: null,
  attrs: {},
}
```

### 3.4 后端实现

#### 3.4.1 API 路由

```typescript
// server/routes/api/transcriptions/transcriptions.ts

router.post("transcriptions.create", auth(), async (ctx) => {
  const { attachmentId, documentId } = ctx.input.body;
  
  // 验证权限
  const document = await Document.findByPk(documentId);
  authorize(ctx.state.user, "update", document);
  
  const attachment = await Attachment.findByPk(attachmentId);
  if (!attachment || !attachment.contentType.startsWith("audio/")) {
    throw ValidationError("Invalid audio attachment");
  }
  
  // 创建转录任务
  const transcription = await Transcription.create({
    attachmentId,
    documentId,
    status: "pending",
    teamId: ctx.state.user.teamId,
    userId: ctx.state.user.id,
  });
  
  // 加入队列
  await TranscriptionQueue.add({
    transcriptionId: transcription.id,
  });
  
  ctx.body = {
    data: transcription,
  };
});

router.post("transcriptions.status", auth(), async (ctx) => {
  const { id } = ctx.input.body;
  const transcription = await Transcription.findByPk(id);
  
  authorize(ctx.state.user, "read", transcription);
  
  ctx.body = {
    data: transcription,
  };
});
```

#### 3.4.2 队列处理器

```typescript
// server/queues/processors/TranscriptionProcessor.ts

export default class TranscriptionProcessor {
  static async perform(job: Job) {
    const { transcriptionId } = job.data;
    
    const transcription = await Transcription.findByPk(transcriptionId, {
      include: [Attachment],
    });
    
    if (!transcription) {
      throw new Error("Transcription not found");
    }
    
    try {
      // 更新状态
      await transcription.update({ status: "processing" });
      
      // 获取音频文件
      const audioBuffer = await transcription.attachment.buffer;
      
      // 调用转录服务
      const provider = TranscriptionProviderFactory.create();
      const result = await provider.transcribe(audioBuffer, {
        language: "auto",
        timestamps: true,
      });
      
      // 转换为 ProseMirror 格式
      const content = this.convertToContent(result);
      
      // 保存结果
      await transcription.update({
        status: "completed",
        content,
        text: result.text,
        metadata: {
          duration: result.duration,
          language: result.language,
          confidence: result.confidence,
          provider: provider.name,
          timestamps: result.timestamps,
        },
      });
      
      // 触发事件通知前端
      await Event.create({
        name: "transcriptions.completed",
        modelId: transcription.id,
        teamId: transcription.teamId,
        actorId: transcription.userId,
      });
      
    } catch (error) {
      await transcription.update({
        status: "failed",
        error: error.message,
      });
      
      throw error;
    }
  }
  
  private static convertToContent(result: TranscriptionResult): ProsemirrorData {
    // 将转录结果转换为 ProseMirror 文档格式
    return {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "会议纪要" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `录制时间: ${new Date().toLocaleString()}`,
            },
          ],
        },
        ...result.paragraphs.map((para) => ({
          type: "paragraph",
          content: [{ type: "text", text: para }],
        })),
      ],
    };
  }
}
```

### 3.5 插件实现

创建独立的转录服务插件：

```typescript
// plugins/transcription/server/provider.ts

export interface TranscriptionProvider {
  name: string;
  transcribe(
    audio: Buffer,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult>;
}

export interface TranscriptionOptions {
  language?: string;
  timestamps?: boolean;
  speakerDiarization?: boolean;
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  language: string;
  confidence: number;
  paragraphs: string[];
  timestamps?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  speakers?: Array<{
    speaker: string;
    text: string;
  }>;
}

// OpenAI Whisper 实现
export class WhisperProvider implements TranscriptionProvider {
  name = "openai-whisper";
  
  async transcribe(
    audio: Buffer,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append("file", new Blob([audio]), "audio.webm");
    formData.append("model", "whisper-1");
    
    if (options.language && options.language !== "auto") {
      formData.append("language", options.language);
    }
    
    if (options.timestamps) {
      formData.append("response_format", "verbose_json");
    }
    
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );
    
    const data = await response.json();
    
    return this.parseResponse(data);
  }
  
  private parseResponse(data: any): TranscriptionResult {
    // 解析 Whisper API 响应
    // 智能分段（按句号、问号、停顿等）
    const paragraphs = this.splitIntoParagraphs(data.text);
    
    return {
      text: data.text,
      duration: data.duration || 0,
      language: data.language || "unknown",
      confidence: 0.9,
      paragraphs,
      timestamps: data.segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
    };
  }
  
  private splitIntoParagraphs(text: string): string[] {
    // 智能分段逻辑
    // 1. 按句号、问号、感叹号分句
    // 2. 每 3-5 句合并为一段
    // 3. 保持语义连贯性
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const paragraphs: string[] = [];
    
    for (let i = 0; i < sentences.length; i += 4) {
      paragraphs.push(
        sentences.slice(i, i + 4).join(" ").trim()
      );
    }
    
    return paragraphs;
  }
}

// 工厂模式
export class TranscriptionProviderFactory {
  static create(): TranscriptionProvider {
    const provider = process.env.TRANSCRIPTION_PROVIDER || "whisper";
    
    switch (provider) {
      case "whisper":
        return new WhisperProvider();
      case "azure":
        return new AzureSpeechProvider();
      case "google":
        return new GoogleSpeechProvider();
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}
```

```json
// plugins/transcription/plugin.json
{
  "id": "transcription",
  "name": "Audio Transcription",
  "description": "Adds audio recording and transcription capabilities to documents.",
  "priority": 30
}
```

### 3.6 实时更新机制

利用现有的 WebSocket 基础设施推送转录进度：

```typescript
// server/collaboration/TranscriptionPresenter.ts

export default function present(transcription: Transcription) {
  return {
    id: transcription.id,
    attachmentId: transcription.attachmentId,
    documentId: transcription.documentId,
    status: transcription.status,
    content: transcription.content,
    text: transcription.text,
    metadata: transcription.metadata,
    error: transcription.error,
    createdAt: transcription.createdAt,
    updatedAt: transcription.updatedAt,
  };
}
```

前端通过 WebSocket 监听事件：

```typescript
// app/stores/TranscriptionsStore.ts

class TranscriptionsStore extends BaseStore<Transcription> {
  constructor(rootStore: RootStore) {
    super(rootStore, Transcription);
    
    // 监听转录完成事件
    this.rootStore.websockets.on(
      "transcriptions.completed",
      this.handleTranscriptionCompleted
    );
  }
  
  @action
  handleTranscriptionCompleted = (event: any) => {
    const transcription = this.get(event.modelId);
    if (transcription) {
      transcription.updateFromJson(event.data);
      
      // 自动插入转录内容到文档
      if (transcription.content) {
        this.insertTranscriptionContent(transcription);
      }
    }
  };
  
  private insertTranscriptionContent(transcription: Transcription) {
    // 在编辑器中插入转录内容
    // 替换原有的 audio-transcription 节点
  }
}
```

## 四、用户交互流程

### 4.1 录音转文本流程

```
1. 用户在编辑器中输入 "/" 打开命令菜单
2. 选择 "会议录音" 选项
3. 浏览器请求麦克风权限
4. 用户点击 "开始录音" 按钮
5. 录音进行中，显示时长和波形
6. 用户点击 "停止录音" 按钮
7. 预览音频，可重新录制或确认
8. 点击 "转录" 按钮
9. 音频上传到服务器（作为 Attachment）
10. 创建 Transcription 记录，加入队列
11. 编辑器中插入占位符节点，显示 "转录中..."
12. 后台处理完成后，通过 WebSocket 推送结果
13. 占位符节点替换为实际转录文本
14. 用户可编辑转录内容
```

### 4.2 上传音频文件流程

```
1. 用户在编辑器中输入 "/" 打开命令菜单
2. 选择 "上传音频" 选项
3. 选择本地音频文件（支持 mp3, wav, m4a, webm）
4. 文件上传到服务器（作为 Attachment）
5. 自动创建 Transcription 记录
6. 后续流程同录音转文本
```

## 五、配置与环境变量

```bash
# .env 配置示例

# 转录服务提供商: whisper | azure | google
TRANSCRIPTION_PROVIDER=whisper

# OpenAI Whisper API
OPENAI_API_KEY=sk-xxx

# Azure Speech Service（可选）
AZURE_SPEECH_KEY=xxx
AZURE_SPEECH_REGION=eastus

# Google Cloud Speech-to-Text（可选）
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# 转录队列配置
TRANSCRIPTION_QUEUE_CONCURRENCY=2
TRANSCRIPTION_MAX_FILE_SIZE=25MB  # Whisper API 限制
TRANSCRIPTION_TIMEOUT=300000      # 5分钟超时
```

## 六、权限与策略

复用现有的文档权限系统：

```typescript
// server/policies/transcription.ts

export default class TranscriptionPolicy {
  static async create(
    user: User,
    document: Document
  ): Promise<boolean> {
    // 只有能编辑文档的用户才能创建转录
    return DocumentPolicy.update(user, document);
  }
  
  static async read(
    user: User,
    transcription: Transcription
  ): Promise<boolean> {
    const document = await transcription.$get("document");
    return DocumentPolicy.read(user, document);
  }
  
  static async delete(
    user: User,
    transcription: Transcription
  ): Promise<boolean> {
    // 只有创建者或管理员可以删除
    return (
      transcription.userId === user.id ||
      user.isAdmin
    );
  }
}
```

## 七、成本与性能考虑

### 7.1 成本估算

- **OpenAI Whisper API**: $0.006/分钟
- **Azure Speech**: $1.00/小时 = $0.0167/分钟
- **Google Cloud Speech**: $0.024/分钟（标准）

建议：
- 默认使用 OpenAI Whisper（性价比高，质量好）
- 为团队设置月度配额限制
- 在 Team 模型中添加 `transcriptionQuota` 字段

### 7.2 性能优化

1. **音频压缩**：前端上传前压缩音频（降低比特率）
2. **队列优先级**：短音频优先处理
3. **缓存结果**：相同音频文件不重复转录
4. **异步处理**：避免阻塞主线程
5. **分段处理**：超长音频分段转录后合并

### 7.3 存储管理

- 音频文件设置过期时间（如 30 天后自动删除）
- 转录完成后可选择删除原始音频
- 在 Attachment 模型中利用现有的 `expiresAt` 字段

## 八、说话人识别与映射（Speaker Diarization & Mapping）

### 8.1 说话人识别功能

转录服务自动识别音频中的不同说话人，并将发言内容按说话人分组。

#### 8.1.1 支持的服务

- **Azure Speech Service**: 支持说话人识别（Speaker Diarization）
- **Google Cloud Speech-to-Text**: 支持说话人识别
- **OpenAI Whisper**: 不直接支持，但可通过 pyannote.audio 等工具后处理

#### 8.1.2 Azure Speech 实现示例

```typescript
// plugins/transcription/server/providers/AzureSpeechProvider.ts
export class AzureSpeechProvider implements TranscriptionProvider {
  name = "azure-speech";
  
  async transcribe(
    audio: Buffer,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const config = SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
    
    // 启用说话人识别
    if (options.speakerDiarization) {
      config.setProperty(
        PropertyId.SpeechServiceConnection_EnableSpeakerDiarization,
        "true"
      );
    }
    
    const audioConfig = AudioConfig.fromWavFileInput(audio);
    const recognizer = new SpeechRecognizer(config, audioConfig);
    
    const results = await this.recognizeWithSpeakers(recognizer);
    
    return this.parseResults(results);
  }
  
  private parseResults(results: any): TranscriptionResult {
    // 按说话人分组
    const speakerSegments = new Map<string, any[]>();
    
    results.forEach((result: any) => {
      const speakerId = result.speakerId || "unknown";
      if (!speakerSegments.has(speakerId)) {
        speakerSegments.set(speakerId, []);
      }
      speakerSegments.get(speakerId)!.push({
        start: result.offset / 10000000, // 转换为秒
        end: (result.offset + result.duration) / 10000000,
        text: result.text,
      });
    });
    
    // 构建检测到的说话人列表
    const detectedSpeakers = Array.from(speakerSegments.entries()).map(
      ([speakerId, segments]) => ({
        id: `speaker_${speakerId}`,
        segments,
      })
    );
    
    return {
      text: results.map((r: any) => r.text).join(" "),
      duration: results[results.length - 1]?.end || 0,
      language: "zh-CN",
      confidence: 0.9,
      paragraphs: this.formatParagraphs(detectedSpeakers),
      metadata: {
        detectedSpeakers,
      },
    };
  }
}
```

### 8.2 说话人映射 UI

转录完成后，如果检测到多个说话人，显示映射界面让用户关联到 User 或 Contact。

#### 8.2.1 映射组件

```typescript
// app/components/TranscriptionSpeakerMapping.tsx
const TranscriptionSpeakerMapping: React.FC<{
  transcription: Transcription;
  onComplete: (mappings: SpeakerMapping[]) => void;
}> = ({ transcription, onComplete }) => {
  const { users, contacts } = useStores();
  const [mappings, setMappings] = useState<Map<string, SpeakerMapping>>(
    new Map()
  );
  
  const detectedSpeakers = transcription.metadata.detectedSpeakers || [];
  
  // 构建候选列表
  const candidates = useMemo(() => {
    const list = [];
    
    // 当前团队用户
    users.orderedData.forEach(user => {
      list.push({
        type: 'user' as const,
        id: user.id,
        label: user.name,
        subtitle: user.email,
        avatar: user.avatarUrl,
      });
    });
    
    // 联系人
    contacts.orderedData.forEach(contact => {
      list.push({
        type: 'contact' as const,
        id: contact.id,
        label: contact.name,
        subtitle: contact.organization?.name || contact.email,
        avatar: contact.avatarUrl,
      });
    });
    
    return list;
  }, [users.orderedData, contacts.orderedData]);
  
  const handleMapping = (speakerId: string, candidate: any) => {
    setMappings(prev => {
      const next = new Map(prev);
      next.set(speakerId, {
        id: speakerId,
        type: candidate.type,
        modelId: candidate.id,
        label: candidate.label,
        segments: detectedSpeakers.find(s => s.id === speakerId)?.segments || [],
      });
      return next;
    });
  };
  
  const handleSkip = (speakerId: string) => {
    setMappings(prev => {
      const next = new Map(prev);
      next.set(speakerId, {
        id: speakerId,
        type: null,
        modelId: null,
        label: `说话人 ${speakerId.replace('speaker_', '')}`,
        segments: detectedSpeakers.find(s => s.id === speakerId)?.segments || [],
      });
      return next;
    });
  };
  
  const handleSubmit = () => {
    onComplete(Array.from(mappings.values()));
  };
  
  return (
    <Modal title="识别会议参与者" onClose={() => {}}>
      <Description>
        我们检测到 {detectedSpeakers.length} 位说话人，请将他们映射到团队成员或联系人。
      </Description>
      
      {detectedSpeakers.map((speaker, index) => {
        const mapping = mappings.get(speaker.id);
        const sampleText = speaker.segments[0]?.text.slice(0, 100);
        
        return (
          <SpeakerRow key={speaker.id}>
            <SpeakerInfo>
              <SpeakerLabel>说话人 {index + 1}</SpeakerLabel>
              <SpeakerSample>{sampleText}...</SpeakerSample>
              <SpeakerStats>
                {speaker.segments.length} 段发言
              </SpeakerStats>
            </SpeakerInfo>
            
            <SpeakerSelector
              value={mapping}
              options={candidates}
              onChange={(candidate) => handleMapping(speaker.id, candidate)}
              placeholder="选择参与者..."
            />
            
            <Button
              onClick={() => handleSkip(speaker.id)}
              neutral
            >
              跳过
            </Button>
          </SpeakerRow>
        );
      })}
      
      <Actions>
        <Button
          onClick={handleSubmit}
          disabled={mappings.size !== detectedSpeakers.length}
        >
          完成映射
        </Button>
      </Actions>
    </Modal>
  );
};
```

#### 8.2.2 映射 API

```typescript
// server/routes/api/transcriptions/transcriptions.ts
router.post("transcriptions.mapSpeakers", auth(), async (ctx) => {
  const { id, speakers } = ctx.input.body;
  
  const transcription = await Transcription.findByPk(id);
  authorize(ctx.state.user, "update", transcription);
  
  // 验证映射的 User 和 Contact 存在且属于同一团队
  for (const speaker of speakers) {
    if (speaker.type === "user") {
      const user = await User.findByPk(speaker.modelId);
      if (!user || user.teamId !== ctx.state.user.teamId) {
        throw ValidationError("Invalid user mapping");
      }
    } else if (speaker.type === "contact") {
      const contact = await Contact.findByPk(speaker.modelId);
      if (!contact || contact.teamId !== ctx.state.user.teamId) {
        throw ValidationError("Invalid contact mapping");
      }
    }
  }
  
  // 保存映射并生成最终内容
  await transcription.update({
    speakers,
    status: "completed",
  });
  
  // 重新生成带说话人信息的内容
  const content = await TranscriptionFormatter.formatWithSpeakers(
    transcription
  );
  
  await transcription.update({ content });
  
  // 触发完成事件
  await Event.create({
    name: "transcriptions.completed",
    modelId: transcription.id,
    teamId: transcription.teamId,
    actorId: ctx.state.user.id,
  });
  
  ctx.body = { data: present(transcription) };
});
```

### 8.3 转录内容格式化

根据说话人映射生成格式化的会议纪要：

```typescript
// server/utils/TranscriptionFormatter.ts
export class TranscriptionFormatter {
  static async formatWithSpeakers(
    transcription: Transcription
  ): Promise<ProsemirrorData> {
    const speakers = transcription.speakers || [];
    const content: any[] = [];
    
    // 标题
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "会议纪要" }],
    });
    
    // 元信息
    const metadata = transcription.metadata;
    content.push({
      type: "paragraph",
      content: [
        { type: "text", text: "时间: " },
        { 
          type: "text", 
          text: new Date(transcription.createdAt).toLocaleString(),
          marks: [{ type: "strong" }],
        },
      ],
    });
    
    if (metadata.duration) {
      content.push({
        type: "paragraph",
        content: [
          { type: "text", text: "时长: " },
          { 
            type: "text", 
            text: this.formatDuration(metadata.duration),
            marks: [{ type: "strong" }],
          },
        ],
      });
    }
    
    // 参与者列表
    if (speakers.length > 0) {
      const participantContent = [
        { type: "text", text: "参与者: ", marks: [{ type: "strong" }] },
      ];
      
      speakers.forEach((speaker, index) => {
        if (speaker.type && speaker.modelId) {
          // 使用 Mention 节点
          participantContent.push({
            type: "mention",
            attrs: {
              type: speaker.type,
              id: speaker.modelId,
              modelId: speaker.modelId,
              label: speaker.label,
            },
          });
        } else {
          // 未映射的说话人显示为纯文本
          participantContent.push({
            type: "text",
            text: speaker.label,
          });
        }
        
        if (index < speakers.length - 1) {
          participantContent.push({ type: "text", text: ", " });
        }
      });
      
      content.push({
        type: "paragraph",
        content: participantContent,
      });
    }
    
    // 分隔线
    content.push({ type: "horizontalRule" });
    
    // 对话内容
    // 按时间顺序合并所有说话人的片段
    const allSegments = speakers.flatMap(speaker =>
      speaker.segments.map(segment => ({
        ...segment,
        speaker,
      }))
    ).sort((a, b) => a.start - b.start);
    
    allSegments.forEach(segment => {
      const paragraphContent = [];
      
      // 说话人标识
      if (segment.speaker.type && segment.speaker.modelId) {
        paragraphContent.push({
          type: "mention",
          attrs: {
            type: segment.speaker.type,
            id: segment.speaker.modelId,
            modelId: segment.speaker.modelId,
            label: segment.speaker.label,
          },
        });
      } else {
        paragraphContent.push({
          type: "text",
          text: segment.speaker.label,
          marks: [{ type: "strong" }],
        });
      }
      
      paragraphContent.push({ type: "text", text: ": " });
      paragraphContent.push({ type: "text", text: segment.text });
      
      content.push({
        type: "paragraph",
        content: paragraphContent,
      });
    });
    
    return {
      type: "doc",
      content,
    };
  }
  
  private static formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}分${secs}秒`;
  }
}
```

### 8.4 工作流程

```
1. 用户上传/录制音频
2. 转录服务处理音频，识别说话人
3. 状态更新为 "speaker_mapping"
4. 前端显示说话人映射界面
5. 用户将检测到的说话人映射到 User 或 Contact
6. 提交映射，后端生成带说话人信息的内容
7. 状态更新为 "completed"
8. 文档中插入格式化的会议纪要
```

### 8.5 配置选项

```bash
# 是否启用说话人识别
TRANSCRIPTION_SPEAKER_DIARIZATION=true

# 最大说话人数量（某些服务有限制）
TRANSCRIPTION_MAX_SPEAKERS=10
```

## 九、扩展功能（未来迭代）

### 9.1 实时转录

- 边录音边转录
- 使用流式 API（如 Azure Speech SDK）
- WebSocket 实时推送转录片段

### 9.2 多语言支持

- 自动检测语言
- 支持多语言混合转录
- 翻译功能（转录后自动翻译）

### 9.3 智能摘要

- 使用 GPT 对转录内容生成摘要
- 提取关键要点和行动项
- 自动生成会议纪要结构

### 9.4 时间戳导航

- 在转录文本中嵌入时间戳
- 点击时间戳跳转到音频对应位置
- 音频播放器与文本同步高亮

## 十、测试策略

### 10.1 单元测试

```typescript
// server/models/Transcription.test.ts
describe("Transcription", () => {
  it("should create transcription with valid attachment", async () => {
    const attachment = await factory.create("Attachment", {
      contentType: "audio/webm",
    });
    
    const transcription = await Transcription.create({
      attachmentId: attachment.id,
      documentId: document.id,
      teamId: team.id,
      userId: user.id,
    });
    
    expect(transcription.status).toBe("pending");
  });
});
```

### 10.2 集成测试

```typescript
// server/routes/api/transcriptions/transcriptions.test.ts
describe("#transcriptions.create", () => {
  it("should create transcription and add to queue", async () => {
    const res = await server.post("/api/transcriptions.create", {
      body: {
        attachmentId: attachment.id,
        documentId: document.id,
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("pending");
  });
});
```

### 10.3 端到端测试

- 录音功能测试（使用模拟音频流）
- 上传音频文件测试
- 转录队列处理测试
- WebSocket 实时更新测试

## 十一、部署与迁移

### 11.1 数据库迁移

```bash
# 创建迁移文件
yarn sequelize migration:create --name add-transcriptions-table

# 运行迁移
yarn sequelize db:migrate
```

### 11.2 环境配置

```bash
# 生产环境配置
TRANSCRIPTION_PROVIDER=whisper
OPENAI_API_KEY=sk-prod-xxx
TRANSCRIPTION_QUEUE_CONCURRENCY=5
```

### 11.3 功能开关

在 Team 模型中添加功能开关：

```typescript
// server/models/Team.ts
preferences: {
  features: {
    transcription: boolean;  // 默认 false
  }
}
```

管理员可在设置中启用/禁用该功能。

## 十二、文档与培训

### 12.1 用户文档

- 如何录制会议音频
- 如何上传音频文件
- 转录结果的编辑和格式化
- 常见问题解答

### 12.2 开发者文档

- API 接口文档
- 插件开发指南
- 自定义转录服务提供商
- 故障排查指南

## 十三、与 Contacts/Organization 集成

### 13.1 集成优势

通过与 Contacts/Organization 功能集成，会议转录功能获得以下增强：

1. **统一的参与者管理**
   - User（团队成员）和 Contact（外部联系人）都可作为 Speaker
   - 自动关联到组织信息
   - 统一的 @ 提及机制

2. **知识关联**
   - 会议纪要自动关联参与者
   - 通过联系人页面查看相关会议
   - 通过组织页面查看所有相关会议

3. **智能建议**
   - 根据历史会议记录建议参与者
   - 根据文档上下文建议联系人映射
   - 自动识别常见参与者

### 13.2 实现要点

```typescript
// 在 Speaker 映射时，优先显示：
// 1. 文档中已提及的 User 和 Contact
// 2. 最近会议中的参与者
// 3. 所有团队成员和联系人

const getSuggestedSpeakers = async (documentId: string) => {
  // 获取文档中已提及的人员
  const mentions = await DocumentContact.findAll({
    where: { documentId },
    include: [Contact, User],
  });
  
  // 获取最近会议的参与者
  const recentTranscriptions = await Transcription.findAll({
    where: {
      documentId,
      status: "completed",
    },
    order: [["createdAt", "DESC"]],
    limit: 5,
  });
  
  const recentSpeakers = recentTranscriptions.flatMap(
    t => t.speakers || []
  );
  
  return {
    suggested: [...mentions, ...recentSpeakers],
    all: [...users, ...contacts],
  };
};
```

### 13.3 UI 增强

在 Speaker 映射界面中：
- 优先显示建议的参与者
- 显示联系人的组织信息
- 支持快速创建新联系人

```typescript
<SpeakerSelector
  suggestions={suggestedSpeakers}
  onCreateContact={(name) => {
    // 快速创建联系人
    const contact = await contacts.create({ name });
    return contact;
  }}
/>
```

## 十四、总结

本方案通过以下方式实现最小化架构影响：

1. **复用现有模型**：音频文件使用 Attachment 模型，无需新的存储机制
2. **插件化设计**：转录服务作为独立插件，可选启用
3. **遵循现有模式**：
   - 使用 Sequelize 模型
   - 使用 Bull 队列处理异步任务
   - 使用 WebSocket 推送实时更新
   - 使用 ProseMirror 节点扩展编辑器
4. **最小依赖**：仅需添加转录服务 API 客户端（如 OpenAI SDK）
5. **向后兼容**：功能可独立禁用，不影响现有文档
6. **与 Contacts 集成**：
   - 复用 Mention 系统
   - User 和 Contact 统一作为 Speaker
   - 自动关联文档与参与者

该方案充分理解了 Outline 的架构设计，在不破坏现有结构的前提下，优雅地集成了会议转录功能，并通过与 Contacts/Organization 功能的深度集成，提供了完整的会议纪要管理解决方案。

## 十五、功能对比与选择

### 15.1 说话人识别服务对比

| 服务 | 说话人识别 | 成本 | 质量 | 推荐场景 |
|------|----------|------|------|---------|
| OpenAI Whisper | ❌ 不支持 | $0.006/分钟 | ⭐⭐⭐⭐⭐ | 单人录音、成本敏感 |
| Azure Speech | ✅ 支持 | $0.0167/分钟 | ⭐⭐⭐⭐ | 多人会议、企业场景 |
| Google Cloud | ✅ 支持 | $0.024/分钟 | ⭐⭐⭐⭐ | 多语言、高精度需求 |

### 15.2 实施建议

**阶段一（MVP）**：
- 使用 OpenAI Whisper 实现基础转录
- 手动标记说话人（无自动识别）
- 支持 User 和 Contact 映射

**阶段二（增强）**：
- 集成 Azure Speech 实现说话人自动识别
- 智能建议参与者映射
- 支持实时转录

**阶段三（完善）**：
- 多服务支持，用户可选择
- AI 摘要和要点提取
- 时间戳导航和音频播放器
