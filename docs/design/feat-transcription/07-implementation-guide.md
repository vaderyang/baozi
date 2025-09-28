# 07 - 实现指南

## 安全与隐私设计

### 数据保护策略

#### 1. 音频数据安全
```typescript
// 加密存储适配器
class EncryptedStorageAdapter implements StorageService {
  constructor(
    private baseStorage: StorageService,
    private encryptionService: EncryptionService
  ) {}

  async uploadChunk(key: string, chunk: Buffer, chunkNumber: number): Promise<void> {
    // 使用AES-256加密音频数据
    const encryptedChunk = await this.encryptionService.encrypt(chunk);
    const encryptedKey = `encrypted/${key}`;
    
    await this.baseStorage.uploadChunk(encryptedKey, encryptedChunk, chunkNumber);
  }

  async generateSignedUploadUrl(key: string, contentType: string): Promise<string> {
    // 生成带有时间限制的签名URL
    return await this.baseStorage.generateSignedUploadUrl(key, contentType);
  }
}

// PII数据清理服务
class PIIScrubbingService {
  private sensitivePatterns = [
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // 信用卡号
    /\b\d{3}-\d{2}-\d{4}\b/, // 社会保险号
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // 邮箱地址
    /\b1[3-9]\d{9}\b/, // 中国手机号
  ];

  async scrubTranscript(text: string): Promise<string> {
    let scrubbedText = text;
    
    for (const pattern of this.sensitivePatterns) {
      scrubbedText = scrubbedText.replace(pattern, '[已隐藏]');
    }
    
    return scrubbedText;
  }
}
```

#### 2. 访问控制
```typescript
// 会议权限检查中间件
export const meetingAccessMiddleware = () => async (ctx: Context, next: Next) => {
  const { meetingId } = ctx.params;
  const userId = ctx.state.auth.user.id;
  const teamId = ctx.state.auth.user.teamId;

  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) {
    ctx.throw(404, 'Meeting not found');
  }

  // 检查团队权限
  if (meeting.teamId !== teamId) {
    ctx.throw(403, 'Access denied to meeting');
  }

  // 检查用户是否为会议参与者或有编辑权限
  const isParticipant = meeting.participants.some(p => p.userId === userId);
  const hasEditPermission = await UserPermission.checkDocumentAccess(
    userId, 
    meeting.documentId, 
    'edit'
  );

  if (!isParticipant && !hasEditPermission) {
    ctx.throw(403, 'Not authorized to access this meeting');
  }

  ctx.state.meeting = meeting;
  await next();
};

// 数据保留策略
class DataRetentionPolicy {
  async applyRetentionPolicy(): Promise<void> {
    const retentionDays = this.getRetentionDays();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 删除过期的录音文件
    const expiredRecordings = await Recording.findAll({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
        state: RecordingState.Completed
      }
    });

    for (const recording of expiredRecordings) {
      await this.storageService.deleteFile(recording.storageUri);
      await recording.update({ storageUri: null, state: RecordingState.Archived });
      
      Logger.info('Audio file archived due to retention policy', {
        recordingId: recording.id,
        meetingId: recording.meetingId
      });
    }
  }

  private getRetentionDays(): number {
    return parseInt(process.env.MEETING_AUDIO_RETENTION_DAYS || '90');
  }
}
```

#### 3. 审计日志
```typescript
class AuditLogger {
  async logMeetingAction(
    userId: string,
    meetingId: string,
    action: string,
    details?: Record<string, any>
  ): Promise<void> {
    await AuditLog.create({
      userId,
      resourceType: 'meeting',
      resourceId: meetingId,
      action,
      details,
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent(),
      timestamp: new Date()
    });
  }

  async logTranscriptionAccess(
    userId: string,
    transcriptId: string,
    action: 'view' | 'edit' | 'export'
  ): Promise<void> {
    await this.logMeetingAction(userId, transcriptId, `transcript_${action}`, {
      transcriptId,
      sensitiveDataAccess: true
    });
  }
}
```

## 可观测性与测试

### 监控指标

#### 1. 业务指标收集
```typescript
class MeetingMetricsCollector {
  async recordMeetingMetrics(meeting: Meeting, recording: Recording): Promise<void> {
    const metrics = await this.metricsClient;
    
    // 录音时长分布
    await metrics.histogram('meeting_duration_minutes', {
      value: recording.duration / (1000 * 60),
      tags: { team_id: meeting.teamId, language: meeting.language }
    });

    // 参与者数量分布
    await metrics.histogram('meeting_participants_count', {
      value: meeting.participants.length,
      tags: { team_id: meeting.teamId }
    });

    // 转写准确度
    if (meeting.transcript) {
      await metrics.histogram('transcription_confidence', {
        value: meeting.transcript.averageConfidence,
        tags: { provider: meeting.transcript.provider, language: meeting.language }
      });
    }
  }

  async recordTranscriptionLatency(
    startTime: Date,
    endTime: Date,
    provider: string,
    audioLength: number
  ): Promise<void> {
    const latencySeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const processingRatio = latencySeconds / (audioLength / 1000);

    await this.metricsClient.histogram('transcription_latency_seconds', {
      value: latencySeconds,
      tags: { provider }
    });

    await this.metricsClient.histogram('transcription_processing_ratio', {
      value: processingRatio,
      tags: { provider }
    });
  }

  async recordError(error: Error, context: Record<string, any>): Promise<void> {
    await this.metricsClient.counter('meeting_errors_total', {
      value: 1,
      tags: {
        error_type: error.constructor.name,
        component: context.component || 'unknown'
      }
    });
  }
}
```

#### 2. 应用监控
```typescript
// 健康检查端点
router.get('/health', async (ctx) => {
  const healthChecks = await Promise.allSettled([
    checkDatabaseConnection(),
    checkStorageService(),
    checkSTTProviders(),
    checkRedisConnection()
  ]);

  const isHealthy = healthChecks.every(check => check.status === 'fulfilled');
  
  ctx.status = isHealthy ? 200 : 503;
  ctx.body = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks: healthChecks.map((check, index) => ({
      name: ['database', 'storage', 'stt', 'redis'][index],
      status: check.status,
      error: check.status === 'rejected' ? check.reason?.message : null
    })),
    timestamp: new Date().toISOString()
  };
});

// 性能监控中间件
export const performanceMonitoring = () => async (ctx: Context, next: Next) => {
  const startTime = Date.now();
  
  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    const route = ctx.matched?.path || 'unknown';
    
    await metricsClient.histogram('http_request_duration_ms', {
      value: duration,
      tags: {
        method: ctx.method,
        route,
        status: ctx.status.toString()
      }
    });
  }
};
```

### 测试策略

#### 1. 单元测试
```typescript
// 领域模型测试
describe('Meeting Aggregate', () => {
  let meeting: Meeting;

  beforeEach(() => {
    meeting = Meeting.create({
      id: MeetingId.generate(),
      title: new MeetingTitle('Test Meeting'),
      participants: [
        Participant.create({ displayName: 'Alice', userId: 'user-1' })
      ],
      scheduledAt: new Date(),
      teamId: 'team-1',
      createdById: 'user-1'
    });
  });

  describe('startRecording', () => {
    it('should start recording for an in-progress meeting', () => {
      // Arrange
      meeting.start();

      // Act
      const events = meeting.startRecording();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RecordingStarted);
      expect(meeting.recordingId).toBeDefined();
    });

    it('should throw error if meeting is not in progress', () => {
      // Act & Assert
      expect(() => meeting.startRecording()).toThrow(InvalidOperationError);
    });
  });

  describe('business invariants', () => {
    it('should not allow more than 100 participants', () => {
      // Arrange
      const participants = Array.from({ length: 101 }, (_, i) => 
        Participant.create({ displayName: `User ${i}` })
      );

      // Act & Assert
      expect(() => 
        Meeting.create({
          id: MeetingId.generate(),
          title: new MeetingTitle('Large Meeting'),
          participants,
          scheduledAt: new Date(),
          teamId: 'team-1',
          createdById: 'user-1'
        })
      ).toThrow(TooManyParticipantsError);
    });
  });
});

// 应用服务测试
describe('MeetingApplicationService', () => {
  let service: MeetingApplicationService;
  let meetingRepository: jest.Mocked<MeetingRepository>;
  let eventDispatcher: jest.Mocked<DomainEventDispatcher>;

  beforeEach(() => {
    meetingRepository = createMockMeetingRepository();
    eventDispatcher = createMockEventDispatcher();
    service = new MeetingApplicationService(meetingRepository, eventDispatcher);
  });

  describe('scheduleMeeting', () => {
    it('should create and save a new meeting', async () => {
      // Arrange
      const command: ScheduleMeetingCommand = {
        title: 'Test Meeting',
        scheduledAt: new Date(),
        participants: [{ displayName: 'Alice', userId: 'user-1' }],
        teamId: 'team-1',
        createdById: 'user-1'
      };

      // Act
      const result = await service.scheduleMeeting(command);

      // Assert
      expect(meetingRepository.save).toHaveBeenCalledWith(expect.any(Meeting));
      expect(eventDispatcher.dispatchAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(MeetingScheduled)])
      );
      expect(result.meetingId).toBeDefined();
    });
  });
});
```

#### 2. 集成测试
```typescript
// API集成测试
describe('Meeting API Integration', () => {
  let app: Application;
  let testUser: User;
  let testTeam: Team;

  beforeAll(async () => {
    app = await createTestApp();
    ({ user: testUser, team: testTeam } = await createTestUserAndTeam());
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST /meetings', () => {
    it('should create a new meeting', async () => {
      const meetingData = {
        title: 'Test Meeting',
        scheduledAt: new Date().toISOString(),
        participants: [
          { displayName: 'Alice', userId: testUser.id }
        ]
      };

      const response = await request(app)
        .post('/api/plugins/meeting-minutes/meetings')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send(meetingData)
        .expect(201);

      expect(response.body.data).toMatchObject({
        title: meetingData.title,
        status: 'scheduled',
        participants: expect.arrayContaining([
          expect.objectContaining({ displayName: 'Alice' })
        ])
      });

      // 验证数据库中的记录
      const meeting = await Meeting.findByPk(response.body.data.id);
      expect(meeting).toBeTruthy();
      expect(meeting?.teamId).toBe(testTeam.id);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/plugins/meeting-minutes/meetings')
        .send({ title: 'Test' })
        .expect(401);
    });
  });

  describe('POST /meetings/:id/recordings/start', () => {
    let meeting: Meeting;

    beforeEach(async () => {
      meeting = await createTestMeeting(testUser, testTeam);
      await meeting.start();
    });

    it('should start recording', async () => {
      const response = await request(app)
        .post(`/api/plugins/meeting-minutes/meetings/${meeting.id}/recordings/start`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ mimeType: 'audio/webm' })
        .expect(200);

      expect(response.body.data).toMatchObject({
        recordingId: expect.any(String),
        uploadUrl: expect.any(String)
      });

      // 验证会议状态更新
      await meeting.reload();
      expect(meeting.recordingId).toBeDefined();
    });
  });
});
```

#### 3. 端到端测试
```typescript
// E2E测试使用Playwright
describe('Meeting Minutes E2E', () => {
  let page: Page;
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    
    // 模拟媒体权限
    await page.context().grantPermissions(['microphone']);
  });

  afterAll(async () => {
    await browser.close();
  });

  test('complete meeting workflow', async () => {
    // 1. 登录并创建新文档
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');

    await page.goto('/doc/new');

    // 2. 插入会议纪要节点
    await page.type('[data-testid="editor"]', '/meeting-minutes ');
    await page.click('[data-testid="meeting-minutes-option"]');

    // 3. 配置会议信息
    await page.fill('[data-testid="meeting-title"]', 'Test Meeting');
    await page.click('[data-testid="add-participant"]');
    await page.fill('[data-testid="participant-name"]', 'John Doe');
    await page.click('[data-testid="save-meeting"]');

    // 4. 开始录音
    await page.click('[data-testid="start-recording"]');
    await page.waitForSelector('[data-testid="recording-indicator"]');
    
    expect(await page.textContent('[data-testid="recording-status"]')).toBe('录音中');

    // 5. 模拟录音一段时间
    await page.waitForTimeout(5000);
    
    // 6. 停止录音
    await page.click('[data-testid="stop-recording"]');
    
    // 7. 等待转写完成
    await page.waitForSelector('[data-testid="transcription-completed"]', {
      timeout: 30000
    });

    // 8. 验证转写结果显示
    const transcriptText = await page.textContent('[data-testid="transcript-preview"]');
    expect(transcriptText).toBeTruthy();

    // 9. 编辑转写片段
    await page.dblclick('[data-testid="transcript-segment-0"]');
    await page.fill('[data-testid="segment-editor"]', '修正后的文本内容');
    await page.press('[data-testid="segment-editor"]', 'Control+Enter');

    // 10. 生成会议纪要
    await page.click('[data-testid="generate-minutes"]');
    
    // 验证文档内容更新
    const documentContent = await page.textContent('[data-testid="document-content"]');
    expect(documentContent).toContain('Test Meeting');
    expect(documentContent).toContain('John Doe');
  });

  test('error handling and recovery', async () => {
    // 测试网络中断恢复
    await page.route('**/recordings/*/chunks', route => {
      route.abort('failed'); // 模拟网络错误
    });

    await page.click('[data-testid="start-recording"]');
    
    // 应该显示错误提示
    await page.waitForSelector('[data-testid="upload-error"]');
    
    // 恢复网络
    await page.unroute('**/recordings/*/chunks');
    
    // 点击重试按钮
    await page.click('[data-testid="retry-upload"]');
    
    // 应该恢复正常
    await page.waitForSelector('[data-testid="recording-indicator"]');
  });
});
```

#### 4. 性能测试
```typescript
// 负载测试
describe('Meeting API Load Tests', () => {
  test('concurrent recording uploads', async () => {
    const concurrentUsers = 50;
    const uploadDuration = 60; // 60秒录音

    const promises = Array.from({ length: concurrentUsers }, async (_, i) => {
      const user = await createTestUser(`user-${i}`);
      const meeting = await createTestMeeting(user);
      
      // 开始录音
      const recording = await startRecording(meeting.id, user.token);
      
      // 模拟音频片段上传
      const uploadPromises = Array.from({ length: uploadDuration }, async (_, chunkIndex) => {
        const audioChunk = generateFakeAudioChunk();
        return uploadAudioChunk(recording.id, chunkIndex, audioChunk, user.token);
      });

      await Promise.all(uploadPromises);
      return { userId: user.id, meetingId: meeting.id };
    });

    const results = await Promise.allSettled(promises);
    const failures = results.filter(result => result.status === 'rejected');
    
    // 允许5%的失败率
    expect(failures.length / concurrentUsers).toBeLessThan(0.05);
  });
});

// SSE连接压力测试
describe('SSE Connection Load Tests', () => {
  test('multiple SSE connections', async () => {
    const connectionCount = 100;
    const connections = [];

    for (let i = 0; i < connectionCount; i++) {
      const eventSource = new EventSource(`/api/meetings/test-meeting-${i}/events`);
      connections.push(eventSource);
      
      await new Promise(resolve => setTimeout(resolve, 10)); // 避免过快创建连接
    }

    // 发送测试事件
    await sendTestEvent('test-meeting-0', { type: 'test', data: 'hello' });

    // 等待事件传播
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 清理连接
    connections.forEach(conn => conn.close());
  });
});
```

## 部署和迁移

### 数据库迁移

#### 1. 增量迁移脚本
```sql
-- Migration 001: 创建会议相关表
-- File: migrations/001-create-meeting-tables.sql

BEGIN;

-- 创建会议表
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    document_id UUID REFERENCES documents(id),
    created_by_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
);

-- 创建会议参与者表
CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    display_name VARCHAR(100) NOT NULL,
    is_organizer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建录音表
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    storage_uri TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    file_size BIGINT DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT 'audio/webm',
    state VARCHAR(20) NOT NULL DEFAULT 'recording',
    started_at TIMESTAMP NOT NULL,
    stopped_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_recording_state CHECK (state IN ('recording', 'paused', 'stopped', 'processing', 'completed', 'failed', 'archived'))
);

-- 创建转写表
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    recording_id UUID NOT NULL REFERENCES recordings(id),
    language_code VARCHAR(10) NOT NULL DEFAULT 'en-US',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    provider VARCHAR(50) NOT NULL,
    provider_job_id VARCHAR(255),
    confidence_score DECIMAL(3,2),
    word_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    CONSTRAINT valid_transcript_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- 创建转写片段表
CREATE TABLE IF NOT EXISTS transcript_segments (
    id UUID PRIMARY KEY,
    transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    start_time_ms INTEGER NOT NULL,
    end_time_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    speaker_label VARCHAR(50),
    confidence_score DECIMAL(3,2),
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_time_range CHECK (start_time_ms <= end_time_ms),
    CONSTRAINT valid_segment_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- 创建事件出站表
CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_meetings_team_id ON meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_document_id ON meetings(document_id) WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id ON meeting_participants(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recordings_meeting_id ON recordings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_recordings_state ON recordings(state);

CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON transcripts(recording_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON transcripts(status);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_transcript_id ON transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_time ON transcript_segments(start_time_ms, end_time_ms);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_sequence ON transcript_segments(transcript_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_event_outbox_processed ON event_outbox(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_outbox_retry ON event_outbox(retry_count) WHERE processed_at IS NULL;

COMMIT;
```

#### 2. 数据迁移验证
```typescript
// 迁移验证脚本
class MigrationValidator {
  async validateMigration001(): Promise<ValidationResult> {
    const results: ValidationResult = {
      success: true,
      errors: [],
      warnings: []
    };

    try {
      // 检查表是否存在
      const tables = ['meetings', 'meeting_participants', 'recordings', 'transcripts', 'transcript_segments', 'event_outbox'];
      for (const table of tables) {
        const exists = await this.checkTableExists(table);
        if (!exists) {
          results.errors.push(`Table ${table} does not exist`);
          results.success = false;
        }
      }

      // 检查索引是否创建
      const indexes = [
        'idx_meetings_team_id',
        'idx_meetings_status',
        'idx_transcript_segments_time'
      ];
      
      for (const index of indexes) {
        const exists = await this.checkIndexExists(index);
        if (!exists) {
          results.warnings.push(`Index ${index} missing - may affect performance`);
        }
      }

      // 检查约束
      await this.validateConstraints(results);

    } catch (error) {
      results.success = false;
      results.errors.push(`Migration validation failed: ${error.message}`);
    }

    return results;
  }

  private async checkTableExists(tableName: string): Promise<boolean> {
    const result = await this.sequelize.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :tableName)`,
      { 
        replacements: { tableName },
        type: QueryTypes.SELECT 
      }
    );
    return result[0].exists;
  }
}
```

### 渐进式发布策略

#### 1. 功能开关 (Feature Flags)
```typescript
// 功能开关配置
class FeatureFlags {
  private flags = new Map<string, FeatureFlag>();

  constructor() {
    this.initializeFlags();
  }

  private initializeFlags(): void {
    this.flags.set('meeting-minutes', {
      enabled: process.env.ENABLE_MEETING_MINUTES === 'true',
      rolloutPercentage: parseInt(process.env.MEETING_MINUTES_ROLLOUT_PERCENTAGE || '0'),
      allowedTeams: (process.env.MEETING_MINUTES_ALLOWED_TEAMS || '').split(',').filter(Boolean),
      enabledInEnvironment: ['development', 'staging', 'production'].includes(process.env.NODE_ENV || '')
    });

    this.flags.set('audio-transcription', {
      enabled: process.env.ENABLE_AUDIO_TRANSCRIPTION === 'true',
      rolloutPercentage: parseInt(process.env.TRANSCRIPTION_ROLLOUT_PERCENTAGE || '0'),
      allowedTeams: (process.env.TRANSCRIPTION_ALLOWED_TEAMS || '').split(',').filter(Boolean)
    });
  }

  isEnabled(flagName: string, teamId?: string, userId?: string): boolean {
    const flag = this.flags.get(flagName);
    if (!flag || !flag.enabled) {
      return false;
    }

    // 检查团队白名单
    if (flag.allowedTeams.length > 0 && teamId) {
      if (!flag.allowedTeams.includes(teamId)) {
        return false;
      }
    }

    // 检查百分比发布
    if (flag.rolloutPercentage > 0 && flag.rolloutPercentage < 100) {
      const hash = this.hashUserId(userId || teamId || '');
      return hash % 100 < flag.rolloutPercentage;
    }

    return flag.rolloutPercentage === 100;
  }

  private hashUserId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
  }
}

// 功能开关中间件
export const featureFlagMiddleware = (flagName: string) => 
  async (ctx: Context, next: Next) => {
    const teamId = ctx.state.auth?.user?.teamId;
    const userId = ctx.state.auth?.user?.id;
    
    if (!featureFlags.isEnabled(flagName, teamId, userId)) {
      ctx.throw(404, 'Feature not available');
    }
    
    await next();
  };
```

#### 2. 蓝绿部署配置
```yaml
# docker-compose.blue-green.yml
version: '3.8'

services:
  outline-blue:
    image: outline:latest
    environment:
      - NODE_ENV=production
      - ENABLE_MEETING_MINUTES=true
      - MEETING_MINUTES_ROLLOUT_PERCENTAGE=50
    volumes:
      - ./plugins:/app/plugins
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.outline-blue.rule=Host(`outline.example.com`)"
      - "traefik.http.services.outline-blue.loadbalancer.server.port=3000"
      - "traefik.http.routers.outline-blue.priority=100"

  outline-green:
    image: outline:previous
    environment:
      - NODE_ENV=production
      - ENABLE_MEETING_MINUTES=false
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.outline-green.rule=Host(`outline.example.com`)"
      - "traefik.http.services.outline-green.loadbalancer.server.port=3000"
      - "traefik.http.routers.outline-green.priority=50"

  load-balancer:
    image: traefik:v2.8
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
    ports:
      - "80:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### 监控和告警

#### 1. 应用监控配置
```typescript
// 监控配置
const monitoringConfig = {
  alerts: [
    {
      name: 'meeting-minutes-error-rate',
      condition: 'error_rate > 0.05',
      window: '5m',
      severity: 'warning',
      channels: ['slack', 'email']
    },
    {
      name: 'transcription-queue-backlog',
      condition: 'queue_length > 100',
      window: '10m',
      severity: 'critical',
      channels: ['pagerduty', 'slack']
    },
    {
      name: 'storage-upload-failures',
      condition: 'upload_failure_rate > 0.1',
      window: '5m',
      severity: 'warning',
      channels: ['slack']
    }
  ],

  dashboards: [
    {
      name: 'Meeting Minutes Overview',
      panels: [
        { type: 'graph', title: 'Active Meetings', query: 'sum(meeting_active_total)' },
        { type: 'graph', title: 'Recording Upload Rate', query: 'rate(audio_chunks_uploaded_total[5m])' },
        { type: 'graph', title: 'Transcription Latency', query: 'histogram_quantile(0.95, transcription_latency_seconds)' },
        { type: 'table', title: 'Top Errors', query: 'topk(10, sum(rate(meeting_errors_total[1h])) by (error_type))' }
      ]
    }
  ]
};

// 告警处理器
class AlertManager {
  async handleAlert(alert: Alert): Promise<void> {
    switch (alert.severity) {
      case 'critical':
        await this.sendPagerDutyAlert(alert);
        await this.sendSlackAlert(alert);
        break;
      case 'warning':
        await this.sendSlackAlert(alert);
        break;
    }

    // 记录告警历史
    await AlertHistory.create({
      name: alert.name,
      severity: alert.severity,
      message: alert.message,
      triggeredAt: new Date(),
      metadata: alert.metadata
    });
  }
}
```

## 实施时间表

### 第一阶段 (2-3周): 基础架构
- [ ] 插件框架搭建
- [ ] 数据库表设计和迁移
- [ ] 基本的REST API端点
- [ ] 录音功能（不含转写）
- [ ] 基础UI组件

### 第二阶段 (2-3周): 转写集成
- [ ] STT提供商适配器
- [ ] 转写任务队列
- [ ] 实时进度推送（SSE）
- [ ] 转写结果存储和编辑
- [ ] 错误处理和重试机制

### 第三阶段 (2周): 编辑器集成
- [ ] ProseMirror节点和扩展
- [ ] 会议纪要生成器
- [ ] 文档模板系统
- [ ] 斜杠命令集成

### 第四阶段 (1-2周): 优化和测试
- [ ] 性能优化
- [ ] 安全审计
- [ ] 完整的测试套件
- [ ] 文档和部署指南

### 第五阶段 (1周): 发布和监控
- [ ] 渐进式发布
- [ ] 监控和告警配置
- [ ] 用户培训材料
- [ ] 生产环境监控

总预计开发时间: 8-11周

这个实现指南提供了完整的开发路线图，确保Meeting Minutes功能的安全、可靠和高质量交付。