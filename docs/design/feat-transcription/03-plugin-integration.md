# 03 - 插件集成设计

## 插件架构概述

Meeting Minutes功能作为Outline的插件实现，充分利用现有的插件系统架构，实现与核心系统的无缝集成。

### 插件目录结构

```
plugins/meeting-minutes/
├── plugin.json                 # 插件元数据配置
├── client/                     # 客户端代码
│   ├── index.tsx               # 客户端插件入口
│   ├── components/             # React组件
│   │   ├── MeetingControls.tsx
│   │   ├── TranscriptEditor.tsx
│   │   ├── RecordingWidget.tsx
│   │   └── SettingsPanel.tsx
│   ├── stores/                 # MobX状态管理
│   │   ├── MeetingStore.ts
│   │   ├── RecordingStore.ts
│   │   └── TranscriptStore.ts
│   ├── hooks/                  # 自定义React hooks
│   │   ├── useRecording.ts
│   │   ├── useTranscript.ts
│   │   └── useWebSocket.ts
│   └── utils/                  # 工具函数
│       ├── audioUtils.ts
│       ├── formatters.ts
│       └── validation.ts
├── server/                     # 服务端代码
│   ├── index.ts                # 服务端插件入口
│   ├── api/                    # API路由
│   │   ├── meetings.ts
│   │   ├── recordings.ts
│   │   ├── transcriptions.ts
│   │   └── webhooks.ts
│   ├── services/               # 业务服务
│   │   ├── MeetingService.ts
│   │   ├── RecordingService.ts
│   │   ├── TranscriptionService.ts
│   │   └── StorageService.ts
│   ├── models/                 # 数据模型
│   │   ├── Meeting.ts
│   │   ├── Recording.ts
│   │   ├── Transcript.ts
│   │   └── TranscriptSegment.ts
│   ├── migrations/             # 数据库迁移
│   │   ├── 001-create-meetings.js
│   │   ├── 002-create-recordings.js
│   │   └── 003-create-transcripts.js
│   └── tasks/                  # 后台任务
│       ├── TranscriptionTask.ts
│       ├── AudioUploadTask.ts
│       └── CleanupTask.ts
├── shared/                     # 共享代码
│   ├── types/                  # TypeScript类型定义
│   │   ├── meeting.ts
│   │   ├── recording.ts
│   │   └── transcript.ts
│   ├── constants/              # 常量定义
│   │   ├── events.ts
│   │   ├── status.ts
│   │   └── config.ts
│   └── utils/                  # 共享工具函数
│       ├── validation.ts
│       ├── formatting.ts
│       └── audio.ts
└── package.json                # 插件依赖管理
```

## 插件注册与配置

### plugin.json 配置

```json
{
  "id": "meeting-minutes",
  "name": "Meeting Minutes with Transcription",
  "version": "1.0.0",
  "description": "Record meetings and generate AI-powered transcripts and minutes",
  "author": "Outline Team",
  "homepage": "https://github.com/outline/outline",
  "license": "BSD-3-Clause",
  "main": {
    "client": "./client/index.tsx",
    "server": "./server/index.ts"
  },
  "dependencies": {
    "react": "^18.0.0",
    "mobx": "^6.0.0",
    "prosemirror-model": "^1.19.0",
    "prosemirror-state": "^1.4.0"
  },
  "peerDependencies": {
    "@outline/editor": "*"
  },
  "deployments": ["cloud", "community", "enterprise"],
  "permissions": [
    "documents:read",
    "documents:write",
    "files:upload",
    "api:access"
  ],
  "settings": {
    "sttProvider": {
      "type": "select",
      "default": "whisper",
      "options": ["whisper", "azure", "gcp"],
      "label": "Speech-to-Text Provider",
      "description": "Choose the AI service for transcription"
    },
    "audioQuality": {
      "type": "select",
      "default": "high",
      "options": ["standard", "high"],
      "label": "Audio Quality",
      "description": "Recording quality setting"
    },
    "autoSave": {
      "type": "boolean",
      "default": true,
      "label": "Auto-save Transcripts",
      "description": "Automatically save transcript edits"
    },
    "retentionDays": {
      "type": "number",
      "default": 90,
      "min": 1,
      "max": 365,
      "label": "Audio Retention (Days)",
      "description": "How long to keep audio files"
    }
  },
  "requiredEnvironment": {
    "MEETING_MINUTES_STORAGE_BUCKET": "S3 bucket for audio storage",
    "MEETING_MINUTES_STT_API_KEY": "API key for transcription service"
  }
}
```

## 客户端插件集成

### 插件注册

```typescript
// client/index.tsx
import React from 'react';
import { createLazyComponent } from '~/components/LazyLoad';
import { Hook, PluginManager } from '~/utils/PluginManager';
import config from '../plugin.json';
import MeetingIcon from './components/MeetingIcon';
import { MeetingStore } from './stores/MeetingStore';

// 初始化插件stores
const meetingStore = new MeetingStore();

// 注册设置面板
PluginManager.add({
  ...config,
  type: Hook.Settings,
  value: {
    group: 'Integrations',
    icon: MeetingIcon,
    description: 'Configure meeting recording and transcription settings.',
    component: createLazyComponent(() => import('./components/SettingsPanel')),
    enabled: (team, user) => user.isAdmin || user.canEdit,
  },
});

// 注册导入工具（从音频文件创建会议纪要）
PluginManager.add({
  ...config,
  type: Hook.Imports,
  value: {
    title: 'Audio Recording',
    subtitle: 'Import audio files to create meeting minutes',
    icon: <MeetingIcon />,
    action: createLazyComponent(() => import('./components/AudioImport')),
  },
});

// 注册自定义图标
PluginManager.add({
  ...config,
  type: Hook.Icon,
  value: MeetingIcon,
});

// 导出store给其他组件使用
export { meetingStore };
```

### 编辑器扩展集成

```typescript
// client/components/MeetingMinutesExtension.ts
import { Node as ProsemirrorNode, NodeSpec, NodeType } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import Node from '@shared/editor/nodes/Node';
import { meetingStore } from '../index';
import MeetingMinutesWidget from './MeetingMinutesWidget';

export default class MeetingMinutesNode extends Node {
  get name() {
    return 'meeting_minutes';
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        meetingId: { default: null },
        title: { default: '' },
        participants: { default: [] },
        duration: { default: 0 },
        recordingId: { default: null },
        transcriptId: { default: null },
        isRecording: { default: false }
      },
      content: 'block*',
      group: 'block',
      defining: true,
      draggable: false,
      atom: false,
      parseDOM: [{
        tag: 'div[data-meeting-minutes]',
        getAttrs: (dom: HTMLElement) => ({
          meetingId: dom.getAttribute('data-meeting-id'),
          title: dom.getAttribute('data-title') || '',
          participants: JSON.parse(dom.getAttribute('data-participants') || '[]'),
          duration: parseInt(dom.getAttribute('data-duration') || '0'),
          recordingId: dom.getAttribute('data-recording-id'),
          transcriptId: dom.getAttribute('data-transcript-id'),
          isRecording: dom.getAttribute('data-is-recording') === 'true'
        })
      }],
      toDOM: (node) => [
        'div',
        {
          'data-meeting-minutes': 'true',
          'data-meeting-id': node.attrs.meetingId,
          'data-title': node.attrs.title,
          'data-participants': JSON.stringify(node.attrs.participants),
          'data-duration': node.attrs.duration.toString(),
          'data-recording-id': node.attrs.recordingId,
          'data-transcript-id': node.attrs.transcriptId,
          'data-is-recording': node.attrs.isRecording.toString(),
          class: 'meeting-minutes-container'
        },
        0
      ]
    };
  }

  widget = ({ node, view, getPos }: {
    node: ProsemirrorNode;
    view: EditorView;
    getPos: () => number;
  }) => (
    <MeetingMinutesWidget
      node={node}
      view={view}
      getPos={getPos}
      meetingStore={meetingStore}
    />
  );

  commands({ type }: { type: NodeType }) {
    return {
      insertMeetingMinutes: (attrs: any = {}) => (state: EditorState, dispatch?: any) => {
        const meetingId = attrs.meetingId || `meeting_${Date.now()}`;
        const node = type.create({
          meetingId,
          title: attrs.title || 'New Meeting',
          participants: attrs.participants || [],
          duration: 0,
          ...attrs
        });

        if (dispatch) {
          const transaction = state.tr.replaceSelectionWith(node);
          dispatch(transaction);
          
          // 初始化会议store状态
          meetingStore.createMeeting({
            id: meetingId,
            title: attrs.title || 'New Meeting',
            participants: attrs.participants || []
          });
        }
        
        return true;
      }
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      textblockTypeInputRule(/^\/meeting-minutes\s$/, type, () => ({
        meetingId: `meeting_${Date.now()}`,
        title: 'New Meeting Minutes',
        participants: [],
        duration: 0
      }))
    ];
  }

  get plugins() {
    return [
      new Plugin({
        key: new PluginKey('meeting-minutes-decorator'),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'meeting_minutes' && node.attrs.isRecording) {
                // 为正在录音的会议添加视觉指示器
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'meeting-minutes-recording'
                  })
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
}
```

### MobX状态管理集成

```typescript
// client/stores/MeetingStore.ts
import { makeObservable, observable, action, computed } from 'mobx';
import { RootStore } from '~/stores/RootStore';
import { ApiClient } from '~/utils/ApiClient';
import { Meeting, Recording, Transcript } from '../../shared/types';

export class MeetingStore {
  @observable meetings: Map<string, Meeting> = new Map();
  @observable recordings: Map<string, Recording> = new Map();
  @observable transcripts: Map<string, Transcript> = new Map();
  @observable isLoading = false;
  @observable error: Error | null = null;

  private rootStore: RootStore;
  private apiClient: ApiClient;
  private eventSources: Map<string, EventSource> = new Map();

  constructor(rootStore: RootStore) {
    makeObservable(this);
    this.rootStore = rootStore;
    this.apiClient = new ApiClient('/api/plugins/meeting-minutes');
  }

  @computed
  get activeMeetings() {
    return Array.from(this.meetings.values()).filter(
      meeting => meeting.status === 'in_progress'
    );
  }

  @computed
  get recordingMeetings() {
    return Array.from(this.meetings.values()).filter(
      meeting => meeting.recordingId && 
      this.recordings.get(meeting.recordingId)?.state === 'recording'
    );
  }

  @action
  async createMeeting(data: {
    title: string;
    participants: Array<{ displayName: string; userId?: string }>;
    scheduledAt?: Date;
  }) {
    this.isLoading = true;
    this.error = null;

    try {
      const meeting = await this.apiClient.post('/meetings', data);
      this.meetings.set(meeting.id, meeting);
      return meeting;
    } catch (error) {
      this.error = error as Error;
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async startRecording(meetingId: string) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');

    try {
      const recording = await this.apiClient.post(
        `/meetings/${meetingId}/recordings/start`,
        { mimeType: 'audio/webm;codecs=opus' }
      );

      this.recordings.set(recording.id, recording);
      
      // 更新会议状态
      const updatedMeeting = { ...meeting, recordingId: recording.id, status: 'in_progress' };
      this.meetings.set(meetingId, updatedMeeting);

      // 开始监听实时事件
      this.subscribeToMeetingEvents(meetingId);

      return recording;
    } catch (error) {
      this.error = error as Error;
      throw error;
    }
  }

  @action
  async stopRecording(meetingId: string) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting?.recordingId) throw new Error('No active recording');

    try {
      await this.apiClient.post(`/recordings/${meeting.recordingId}/stop`);
      
      // 更新录音状态
      const recording = this.recordings.get(meeting.recordingId);
      if (recording) {
        this.recordings.set(meeting.recordingId, {
          ...recording,
          state: 'stopped'
        });
      }

      // 取消事件订阅
      this.unsubscribeFromMeetingEvents(meetingId);

    } catch (error) {
      this.error = error as Error;
      throw error;
    }
  }

  @action
  private subscribeToMeetingEvents(meetingId: string) {
    const eventSource = new EventSource(
      `/api/plugins/meeting-minutes/meetings/${meetingId}/events`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleRealtimeEvent(data);
    };

    eventSource.onerror = () => {
      console.warn('EventSource connection error, attempting to reconnect...');
      // 自动重连逻辑
      setTimeout(() => {
        this.subscribeToMeetingEvents(meetingId);
      }, 5000);
    };

    this.eventSources.set(meetingId, eventSource);
  }

  @action
  private handleRealtimeEvent(event: any) {
    switch (event.type) {
      case 'transcription_progress':
        this.updateTranscriptionProgress(event.transcriptId, event.progress);
        break;
      case 'transcription_completed':
        this.loadTranscript(event.transcriptId);
        break;
      case 'recording_chunk_uploaded':
        this.updateRecordingProgress(event.recordingId, event.uploadedChunks);
        break;
    }
  }

  @action
  private updateTranscriptionProgress(transcriptId: string, progress: number) {
    const transcript = this.transcripts.get(transcriptId);
    if (transcript) {
      this.transcripts.set(transcriptId, {
        ...transcript,
        progress
      });
    }
  }

  @action
  async loadTranscript(transcriptId: string) {
    try {
      const transcript = await this.apiClient.get(`/transcriptions/${transcriptId}`);
      this.transcripts.set(transcriptId, transcript);
      return transcript;
    } catch (error) {
      console.error('Failed to load transcript:', error);
    }
  }

  private unsubscribeFromMeetingEvents(meetingId: string) {
    const eventSource = this.eventSources.get(meetingId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(meetingId);
    }
  }

  // 清理资源
  dispose() {
    this.eventSources.forEach(eventSource => eventSource.close());
    this.eventSources.clear();
  }
}

// 集成到Outline的RootStore
declare module '~/stores/RootStore' {
  interface RootStore {
    meetingMinutes: MeetingStore;
  }
}
```

## 服务端插件集成

### 插件注册

```typescript
// server/index.ts
import { PluginManager, Hook, PluginPriority } from '@server/utils/PluginManager';
import config from '../plugin.json';
import meetingsRouter from './api/meetings';
import recordingsRouter from './api/recordings';
import transcriptionsRouter from './api/transcriptions';
import webhooksRouter from './api/webhooks';
import { TranscriptionTask } from './tasks/TranscriptionTask';
import { AudioUploadTask } from './tasks/AudioUploadTask';
import { CleanupTask } from './tasks/CleanupTask';
import { MeetingUninstallHandler } from './handlers/UninstallHandler';
import env from './env';

// 检查必要的环境变量
const enabled = Boolean(
  env.MEETING_MINUTES_STORAGE_BUCKET && 
  env.MEETING_MINUTES_STT_API_KEY
);

if (enabled) {
  // 注册API路由
  PluginManager.add([
    {
      ...config,
      type: Hook.API,
      value: meetingsRouter,
      priority: PluginPriority.Normal,
    },
    {
      ...config,
      type: Hook.API,
      value: recordingsRouter,
      priority: PluginPriority.Normal,
    },
    {
      ...config,
      type: Hook.API,
      value: transcriptionsRouter,
      priority: PluginPriority.Normal,
    },
    {
      ...config,
      type: Hook.API,
      value: webhooksRouter,
      priority: PluginPriority.High, // Webhooks需要高优先级
    }
  ]);

  // 注册后台任务
  PluginManager.add([
    {
      ...config,
      type: Hook.Task,
      value: TranscriptionTask,
    },
    {
      ...config,
      type: Hook.Task,
      value: AudioUploadTask,
    },
    {
      ...config,
      type: Hook.Task,
      value: CleanupTask,
    }
  ]);

  // 注册卸载处理器
  PluginManager.add({
    ...config,
    type: Hook.Uninstall,
    value: MeetingUninstallHandler,
  });
} else {
  console.warn(
    'Meeting Minutes plugin is disabled. ' +
    'Please configure MEETING_MINUTES_STORAGE_BUCKET and MEETING_MINUTES_STT_API_KEY'
  );
}

export { enabled as meetingMinutesEnabled };
```

### 数据库集成

```typescript
// server/models/Meeting.ts
import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
  HasOne,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  Default
} from 'sequelize-typescript';
import { Team, User, Document } from '@server/models';
import { Recording } from './Recording';
import { Transcript } from './Transcript';
import { MeetingParticipant } from './MeetingParticipant';

@Table({
  tableName: 'meetings',
  modelName: 'meeting'
})
export class Meeting extends Model<Meeting> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @Column(DataType.STRING(200))
  title: string;

  @Column(DataType.TEXT)
  description?: string;

  @Column(DataType.DATE)
  scheduledAt?: Date;

  @Column(DataType.DATE)
  startedAt?: Date;

  @Column(DataType.DATE)
  endedAt?: Date;

  @Default('scheduled')
  @Column(DataType.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'))
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // 关联关系
  @BelongsTo(() => Team)
  team: Team;

  @BelongsTo(() => User)
  createdBy: User;

  @BelongsTo(() => Document)
  document?: Document;

  @HasMany(() => MeetingParticipant)
  participants: MeetingParticipant[];

  @HasOne(() => Recording)
  recording?: Recording;

  @HasOne(() => Transcript)
  transcript?: Transcript;

  // 业务方法
  async startMeeting() {
    this.status = 'in_progress';
    this.startedAt = new Date();
    await this.save();
  }

  async completeMeeting() {
    this.status = 'completed';
    this.endedAt = new Date();
    await this.save();
  }

  async getDuration(): Promise<number> {
    if (!this.startedAt || !this.endedAt) {
      return 0;
    }
    return this.endedAt.getTime() - this.startedAt.getTime();
  }

  // 权限检查
  async hasAccess(userId: string): Promise<boolean> {
    const user = await User.findByPk(userId);
    if (!user) return false;

    // 检查是否是同一团队
    if (user.teamId !== this.teamId) return false;

    // 检查是否是参与者
    const participant = await MeetingParticipant.findOne({
      where: { meetingId: this.id, userId }
    });
    if (participant) return true;

    // 检查是否有文档编辑权限
    if (this.documentId) {
      // 这里应该调用Outline的权限检查系统
      // 简化示例，实际需要集成Outline的权限系统
      return user.isAdmin;
    }

    return false;
  }
}
```

## 与Outline核心的集成点

### 文档系统集成

```typescript
// server/services/DocumentIntegrationService.ts
import { Document } from '@server/models';
import { Meeting } from '../models/Meeting';
import { Transcript } from '../models/Transcript';

export class DocumentIntegrationService {
  async createMeetingDocument(meeting: Meeting, transcript?: Transcript): Promise<Document> {
    const documentData = {
      title: meeting.title,
      collectionId: null, // 可以根据团队设置选择默认集合
      teamId: meeting.teamId,
      createdById: meeting.createdById,
      sourceMetadata: {
        type: 'meeting_minutes',
        meetingId: meeting.id,
        participants: await this.getMeetingParticipants(meeting),
        duration: await meeting.getDuration(),
        recordingId: meeting.recording?.id,
        transcriptId: transcript?.id,
        generatedAt: new Date().toISOString()
      }
    };

    const document = await Document.create(documentData);
    
    // 关联会议和文档
    await meeting.update({ documentId: document.id });

    // 如果有转写内容，生成初始文档内容
    if (transcript) {
      const content = await this.generateDocumentContent(meeting, transcript);
      await document.update({ 
        text: content.markdown,
        content: content.prosemirror 
      });
    }

    return document;
  }

  private async generateDocumentContent(meeting: Meeting, transcript: Transcript) {
    const participants = await this.getMeetingParticipants(meeting);
    const duration = await meeting.getDuration();
    
    // 生成Markdown内容
    const markdown = this.generateMarkdown(meeting, transcript, participants, duration);
    
    // 生成ProseMirror内容
    const prosemirror = this.generateProseMirrorContent(meeting, transcript, participants);

    return { markdown, prosemirror };
  }

  private generateMarkdown(meeting: Meeting, transcript: Transcript, participants: any[], duration: number): string {
    const durationMinutes = Math.round(duration / (1000 * 60));
    
    let markdown = `# ${meeting.title}\n\n`;
    markdown += `**Date:** ${meeting.scheduledAt?.toLocaleDateString() || 'N/A'}\n`;
    markdown += `**Duration:** ${durationMinutes} minutes\n`;
    markdown += `**Participants:**\n`;
    
    participants.forEach(p => {
      markdown += `- ${p.displayName}\n`;
    });
    
    markdown += `\n## Transcript\n\n`;
    
    transcript.segments?.forEach(segment => {
      const timestamp = this.formatTimestamp(segment.startTimeMs);
      markdown += `**${segment.speakerLabel || 'Unknown'} (${timestamp}):** ${segment.text}\n\n`;
    });

    return markdown;
  }

  private generateProseMirrorContent(meeting: Meeting, transcript: Transcript, participants: any[]) {
    return {
      type: 'doc',
      content: [
        {
          type: 'meeting_minutes',
          attrs: {
            meetingId: meeting.id,
            title: meeting.title,
            participants: participants,
            duration: meeting.getDuration(),
            recordingId: meeting.recording?.id,
            transcriptId: transcript.id
          },
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: meeting.title }]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Date: ' },
                { type: 'text', text: meeting.scheduledAt?.toLocaleDateString() || 'N/A', marks: [{ type: 'strong' }] }
              ]
            },
            // ... 更多内容
          ]
        }
      ]
    };
  }

  private async getMeetingParticipants(meeting: Meeting) {
    await meeting.reload({ include: ['participants'] });
    return meeting.participants?.map(p => ({
      id: p.id,
      displayName: p.displayName,
      userId: p.userId
    })) || [];
  }

  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
```

### 权限系统集成

```typescript
// server/middleware/meetingAuth.ts
import { Context, Next } from 'koa';
import { Meeting } from '../models/Meeting';

export const meetingAuthMiddleware = () => async (ctx: Context, next: Next) => {
  const { meetingId } = ctx.params;
  const user = ctx.state.auth.user;

  if (!user) {
    ctx.throw(401, 'Authentication required');
  }

  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) {
    ctx.throw(404, 'Meeting not found');
  }

  // 检查访问权限
  const hasAccess = await meeting.hasAccess(user.id);
  if (!hasAccess) {
    ctx.throw(403, 'Access denied to this meeting');
  }

  ctx.state.meeting = meeting;
  await next();
};

export const meetingEditMiddleware = () => async (ctx: Context, next: Next) => {
  const meeting = ctx.state.meeting;
  const user = ctx.state.auth.user;

  // 检查编辑权限 (创建者、管理员、或有文档编辑权限的用户)
  if (meeting.createdById !== user.id && !user.isAdmin) {
    if (meeting.documentId) {
      // 检查文档编辑权限
      // 这里需要集成Outline的文档权限系统
      const hasDocumentEditPermission = await checkDocumentEditPermission(
        user.id,
        meeting.documentId
      );
      
      if (!hasDocumentEditPermission) {
        ctx.throw(403, 'No permission to edit this meeting');
      }
    } else {
      ctx.throw(403, 'No permission to edit this meeting');
    }
  }

  await next();
};

async function checkDocumentEditPermission(userId: string, documentId: string): Promise<boolean> {
  // 这里应该调用Outline的权限检查API
  // 简化示例，实际实现需要集成Outline的权限系统
  const { Document, User } = await import('@server/models');
  
  const document = await Document.findByPk(documentId);
  const user = await User.findByPk(userId);
  
  if (!document || !user) return false;
  
  // 检查团队权限
  if (document.teamId !== user.teamId) return false;
  
  // 这里应该有更复杂的权限逻辑
  return user.isAdmin || document.createdById === userId;
}
```

## 插件配置与环境管理

### 环境变量配置

```typescript
// server/env.ts
import baseEnv from '@server/env';

export default {
  // 继承Outline核心环境变量
  ...baseEnv,
  
  // Meeting Minutes特定配置
  MEETING_MINUTES_STT_PROVIDER: process.env.MEETING_MINUTES_STT_PROVIDER || 'whisper',
  MEETING_MINUTES_STT_API_KEY: process.env.MEETING_MINUTES_STT_API_KEY,
  MEETING_MINUTES_STT_API_URL: process.env.MEETING_MINUTES_STT_API_URL,
  
  MEETING_MINUTES_STORAGE_BUCKET: process.env.MEETING_MINUTES_STORAGE_BUCKET,
  MEETING_MINUTES_STORAGE_REGION: process.env.MEETING_MINUTES_STORAGE_REGION || 'us-east-1',
  MEETING_MINUTES_STORAGE_ACCESS_KEY: process.env.MEETING_MINUTES_STORAGE_ACCESS_KEY,
  MEETING_MINUTES_STORAGE_SECRET_KEY: process.env.MEETING_MINUTES_STORAGE_SECRET_KEY,
  
  MEETING_MINUTES_AUDIO_RETENTION_DAYS: parseInt(
    process.env.MEETING_MINUTES_AUDIO_RETENTION_DAYS || '90'
  ),
  MEETING_MINUTES_MAX_RECORDING_DURATION: parseInt(
    process.env.MEETING_MINUTES_MAX_RECORDING_DURATION || '14400' // 4小时
  ),
  MEETING_MINUTES_MAX_FILE_SIZE: parseInt(
    process.env.MEETING_MINUTES_MAX_FILE_SIZE || '1073741824' // 1GB
  ),
  
  MEETING_MINUTES_WEBHOOK_SECRET: process.env.MEETING_MINUTES_WEBHOOK_SECRET,
  MEETING_MINUTES_ENABLE_PII_SCRUBBING: process.env.MEETING_MINUTES_ENABLE_PII_SCRUBBING === 'true',
};
```

### 插件配置验证

```typescript
// server/validation/configValidation.ts
import Joi from 'joi';
import env from '../env';

const configSchema = Joi.object({
  MEETING_MINUTES_STT_PROVIDER: Joi.string()
    .valid('whisper', 'azure', 'gcp')
    .required(),
  MEETING_MINUTES_STT_API_KEY: Joi.string().required(),
  MEETING_MINUTES_STORAGE_BUCKET: Joi.string().required(),
  MEETING_MINUTES_STORAGE_REGION: Joi.string().default('us-east-1'),
  MEETING_MINUTES_AUDIO_RETENTION_DAYS: Joi.number().min(1).max(365).default(90),
  MEETING_MINUTES_MAX_RECORDING_DURATION: Joi.number().min(60).max(86400).default(14400),
  MEETING_MINUTES_MAX_FILE_SIZE: Joi.number().min(1024).default(1073741824),
});

export function validateConfig() {
  const { error, value } = configSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false
  });

  if (error) {
    const missingConfigs = error.details.map(detail => detail.path.join('.')).join(', ');
    throw new Error(`Missing or invalid Meeting Minutes configuration: ${missingConfigs}`);
  }

  return value;
}

// 在插件启动时验证配置
try {
  validateConfig();
  console.log('Meeting Minutes plugin configuration is valid');
} catch (error) {
  console.error('Meeting Minutes plugin configuration error:', error.message);
  process.exit(1);
}
```

这个插件集成设计确保了Meeting Minutes功能与Outline现有系统的深度集成，同时保持了插件的独立性和可维护性。通过标准的插件接口，实现了与编辑器、权限系统、数据存储等核心组件的无缝协作。