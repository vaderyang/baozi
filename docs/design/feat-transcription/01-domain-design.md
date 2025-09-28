# 01 - 领域设计 (Domain-Driven Design)

## 边界上下文 (Bounded Contexts)

### 会议纪要上下文 (Meeting Minutes BC)
**职责**：管理会议的生命周期、参与者信息、议程管理以及与文档系统的集成。

**核心概念**：
- Meeting（会议）：业务核心聚合根
- Participant（参与者）：会议成员管理
- Agenda（议程）：会议结构化内容
- MinutesDocument：与Outline文档系统的桥接

### 媒体转写上下文 (Media Transcription BC)
**职责**：处理音频录制、存储、转写的技术流程。

**核心概念**：
- Recording（录音）：音频数据管理
- Transcript（转写）：STT结果处理
- AudioChunk（音频片段）：流式处理单元
- TranscriptionJob（转写任务）：异步作业管理

### 文档上下文 (Documents BC - 现有)
**职责**：Outline核心文档管理功能（不变）。

**集成方式**：通过`sourceMetadata`字段标识文档类型为`meeting_minutes`。

## 上下文映射 (Context Map)

```
Meeting Minutes BC ────Published Language────▶ Documents BC
       │                                           ▲
       │                                           │
       └──────Conformist──────▶ Media Transcription BC
                               │
                               └──Anti-Corruption Layer──▶ External STT Providers
```

## 通用语言 (Ubiquitous Language)

### 会议域术语
- **Meeting**：一次完整的会议会话，可以包含录音和转写
- **Recording**：会议的音频录制，由多个AudioChunk组成
- **Transcript**：语音转文字的结果，包含时间戳和说话人信息
- **Participant**：会议参与者，可以是内部用户或外部人员
- **Agenda Item**：会议议程条目，结构化的讨论主题
- **Minutes Document**：会议纪要文档，继承自Outline Document

### 技术域术语
- **Audio Chunk**：录音的分段数据，便于流式上传和处理
- **Transcription Segment**：转写的文本片段，带有时间戳和置信度
- **STT Provider**：语音转文字服务提供商（Whisper、Azure、GCP等）
- **Speaker Recognition**：说话人识别和区分
- **Confidence Score**：转写准确度评分

## 聚合设计 (Aggregates)

### Meeting 聚合
```typescript
class Meeting {
  private constructor(
    public readonly id: MeetingId,
    public title: MeetingTitle,
    public participants: Participant[],
    public scheduledAt: Timestamp,
    public status: MeetingStatus,
    public recordingId?: RecordingId,
    public transcriptId?: TranscriptId,
    public documentId?: DocumentId
  ) {}

  // 业务方法
  public start(): DomainEvent[] {
    if (this.status !== MeetingStatus.Scheduled) {
      throw new InvalidMeetingStateError();
    }
    this.status = MeetingStatus.InProgress;
    return [new MeetingStarted(this.id, new Date())];
  }

  public startRecording(): DomainEvent[] {
    if (this.status !== MeetingStatus.InProgress) {
      throw new InvalidOperationError('Cannot start recording outside active meeting');
    }
    const recordingId = RecordingId.generate();
    this.recordingId = recordingId;
    return [new RecordingStarted(this.id, recordingId, new Date())];
  }

  public finishWithTranscription(transcriptId: TranscriptId): DomainEvent[] {
    this.status = MeetingStatus.Completed;
    this.transcriptId = transcriptId;
    return [
      new MeetingCompleted(this.id, new Date()),
      new TranscriptionLinked(this.id, transcriptId)
    ];
  }
}
```

### Recording 聚合
```typescript
class Recording {
  private constructor(
    public readonly id: RecordingId,
    public readonly meetingId: MeetingId,
    public storageUri: string,
    public duration: Duration,
    public size: FileSize,
    public chunkCount: number,
    public state: RecordingState
  ) {}

  public pause(): DomainEvent[] {
    if (this.state !== RecordingState.Recording) {
      throw new InvalidRecordingStateError();
    }
    this.state = RecordingState.Paused;
    return [new RecordingPaused(this.id, new Date())];
  }

  public stop(): DomainEvent[] {
    if (this.state === RecordingState.Stopped) {
      return [];
    }
    this.state = RecordingState.Stopped;
    return [new RecordingStopped(this.id, this.duration, new Date())];
  }
}
```

### Transcript 聚合
```typescript
class Transcript {
  private constructor(
    public readonly id: TranscriptId,
    public readonly meetingId: MeetingId,
    public language: LanguageCode,
    public status: TranscriptionStatus,
    public segments: TranscriptSegment[],
    public confidence: Confidence,
    public providerMetadata: ProviderMetadata
  ) {}

  public addSegment(segment: TranscriptSegment): void {
    // 按时间戳排序插入
    const insertIndex = this.segments.findIndex(s => s.startTime > segment.startTime);
    if (insertIndex === -1) {
      this.segments.push(segment);
    } else {
      this.segments.splice(insertIndex, 0, segment);
    }
  }

  public editSegment(segmentId: SegmentId, newText: string): DomainEvent[] {
    const segment = this.segments.find(s => s.id.equals(segmentId));
    if (!segment) {
      throw new SegmentNotFoundError();
    }
    segment.text = newText;
    segment.isEdited = true;
    return [new TranscriptEdited(this.id, segmentId, newText, new Date())];
  }
}
```

## 值对象 (Value Objects)

```typescript
// 标识符值对象
class MeetingId extends ValueObject<string> {
  public static generate(): MeetingId {
    return new MeetingId(uuidv4());
  }
}

class RecordingId extends ValueObject<string> {
  public static generate(): RecordingId {
    return new RecordingId(uuidv4());
  }
}

// 业务值对象
class MeetingTitle extends ValueObject<string> {
  constructor(value: string) {
    if (!value || value.length > 200) {
      throw new InvalidTitleError('Title must be 1-200 characters');
    }
    super(value);
  }
}

class Duration extends ValueObject<number> {
  constructor(private milliseconds: number) {
    if (milliseconds < 0) {
      throw new InvalidDurationError();
    }
    super(milliseconds);
  }

  public toMinutes(): number {
    return Math.round(this.milliseconds / 60000);
  }
}

class LanguageCode extends ValueObject<string> {
  constructor(value: string) {
    // BCP 47 validation
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
      throw new InvalidLanguageCodeError();
    }
    super(value);
  }
}

class Confidence extends ValueObject<number> {
  constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new InvalidConfidenceError('Confidence must be between 0 and 1');
    }
    super(value);
  }
}
```

## 领域事件 (Domain Events)

### 会议生命周期事件
```typescript
abstract class DomainEvent {
  public readonly occurredAt: Date = new Date();
  public readonly eventId: string = uuidv4();
}

class MeetingScheduled extends DomainEvent {
  constructor(
    public readonly meetingId: MeetingId,
    public readonly title: MeetingTitle,
    public readonly scheduledAt: Timestamp
  ) { super(); }
}

class MeetingStarted extends DomainEvent {
  constructor(
    public readonly meetingId: MeetingId,
    public readonly startedAt: Date
  ) { super(); }
}

class RecordingStarted extends DomainEvent {
  constructor(
    public readonly meetingId: MeetingId,
    public readonly recordingId: RecordingId,
    public readonly startedAt: Date
  ) { super(); }
}

class RecordingPaused extends DomainEvent {
  constructor(
    public readonly recordingId: RecordingId,
    public readonly pausedAt: Date
  ) { super(); }
}

class RecordingStopped extends DomainEvent {
  constructor(
    public readonly recordingId: RecordingId,
    public readonly duration: Duration,
    public readonly stoppedAt: Date
  ) { super(); }
}
```

### 转写流程事件
```typescript
class TranscriptionRequested extends DomainEvent {
  constructor(
    public readonly recordingId: RecordingId,
    public readonly provider: STTProvider,
    public readonly options: TranscriptionOptions
  ) { super(); }
}

class TranscriptionProgressed extends DomainEvent {
  constructor(
    public readonly transcriptId: TranscriptId,
    public readonly progressPercent: number,
    public readonly estimatedTimeRemaining?: Duration
  ) { super(); }
}

class TranscriptionCompleted extends DomainEvent {
  constructor(
    public readonly transcriptId: TranscriptId,
    public readonly segmentCount: number,
    public readonly averageConfidence: Confidence
  ) { super(); }
}

class TranscriptEdited extends DomainEvent {
  constructor(
    public readonly transcriptId: TranscriptId,
    public readonly segmentId: SegmentId,
    public readonly newText: string,
    public readonly editedAt: Date
  ) { super(); }
}

class MinutesPublished extends DomainEvent {
  constructor(
    public readonly meetingId: MeetingId,
    public readonly documentId: DocumentId,
    public readonly publishedAt: Date
  ) { super(); }
}
```

## 领域服务 (Domain Services)

### TranscriptionService
处理跨聚合的转写业务逻辑：

```typescript
class TranscriptionService {
  constructor(
    private sttProvider: STTProvider,
    private storageService: StorageService,
    private eventDispatcher: DomainEventDispatcher
  ) {}

  public async requestTranscription(
    recording: Recording,
    options: TranscriptionOptions
  ): Promise<TranscriptionJob> {
    // 验证录音状态
    if (recording.state !== RecordingState.Completed) {
      throw new InvalidRecordingStateError();
    }

    // 创建转写任务
    const job = await this.sttProvider.createJob({
      audioUri: recording.storageUri,
      language: options.language,
      enableSpeakerRecognition: options.enableSpeakerRecognition
    });

    // 发布领域事件
    await this.eventDispatcher.dispatch(
      new TranscriptionRequested(recording.id, this.sttProvider.name, options)
    );

    return job;
  }
}
```

### MeetingMinutesGenerator
生成结构化会议纪要：

```typescript
class MeetingMinutesGenerator {
  public async generateMinutes(
    meeting: Meeting,
    transcript: Transcript,
    template?: MinutesTemplate
  ): Promise<MinutesContent> {
    const content = new MinutesContent();
    
    // 添加元数据
    content.addSection(new MetadataSection({
      title: meeting.title.value,
      date: meeting.scheduledAt,
      participants: meeting.participants,
      duration: transcript.calculateDuration()
    }));

    // 根据模板生成结构化内容
    if (template) {
      for (const section of template.sections) {
        const relevantSegments = this.extractRelevantSegments(transcript, section.keywords);
        content.addSection(new ContentSection(section.title, relevantSegments));
      }
    } else {
      // 默认按时间顺序生成
      content.addSection(new TranscriptSection(transcript.segments));
    }

    return content;
  }

  private extractRelevantSegments(
    transcript: Transcript,
    keywords: string[]
  ): TranscriptSegment[] {
    // 使用NLP技术提取相关段落
    return transcript.segments.filter(segment =>
      keywords.some(keyword => 
        segment.text.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }
}
```

## 业务规则与不变量

### Meeting聚合不变量
1. **唯一性约束**：一个Meeting在同一时间只能有一个活跃的Recording
2. **状态转换约束**：Meeting状态必须按照有效的生命周期转换
3. **参与者限制**：一个Meeting最多100个参与者
4. **时间约束**：scheduledAt不能是过去时间

### Recording聚合不变量
1. **状态一致性**：Recording的状态必须与实际的录制状态一致
2. **数据完整性**：所有AudioChunk的总大小必须等于Recording.size
3. **时长约束**：录制时长不能超过24小时

### Transcript聚合不变量
1. **时间顺序**：TranscriptSegment必须按startTime排序
2. **置信度范围**：所有Confidence值必须在0-1范围内
3. **语言一致性**：所有TranscriptSegment的语言必须与Transcript.language一致

## 仓储接口 (Repository Interfaces)

```typescript
interface MeetingRepository {
  save(meeting: Meeting): Promise<void>;
  findById(id: MeetingId): Promise<Meeting | null>;
  findByUser(userId: UserId, status?: MeetingStatus): Promise<Meeting[]>;
  findScheduledMeetings(from: Date, to: Date): Promise<Meeting[]>;
}

interface RecordingRepository {
  save(recording: Recording): Promise<void>;
  findById(id: RecordingId): Promise<Recording | null>;
  findByMeeting(meetingId: MeetingId): Promise<Recording[]>;
}

interface TranscriptRepository {
  save(transcript: Transcript): Promise<void>;
  findById(id: TranscriptId): Promise<Transcript | null>;
  findByMeeting(meetingId: MeetingId): Promise<Transcript | null>;
  updateSegment(transcriptId: TranscriptId, segmentId: SegmentId, newText: string): Promise<void>;
}
```

这些仓储接口将在基础设施层通过Sequelize等ORM实现，确保领域层与技术实现的解耦。