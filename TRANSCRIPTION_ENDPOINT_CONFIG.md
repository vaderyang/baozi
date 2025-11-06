# Transcription Endpoint Configuration

## 功能说明

现在可以在 AI Settings 界面中配置 Transcription API Endpoint，而不仅仅依赖环境变量。

## 实现的更改

### 1. 前端更改

#### `shared/types.ts`
- 在 `TeamPreference` 枚举中添加了 `TranscriptionEndpoint` 选项
- 在 `TeamPreferences` 类型中添加了对应的类型定义

#### `app/scenes/Settings/AI.tsx`
- 添加了 "Transcription" 部分
- 添加了 `transcriptionEndpoint` 状态管理
- 添加了输入框用于配置 transcription endpoint
- 在保存时将配置保存到 team preferences

### 2. 后端更改

#### `server/queues/tasks/TranscriptionTask.ts`
- 修改了 `perform` 方法，在发送转录请求前先从 team preferences 读取 endpoint
- 如果 team preferences 中配置了 endpoint，则使用该配置
- 否则回退到环境变量 `TRANSCRIPTION_ENDPOINT` 的默认值
- 添加了错误处理，确保即使读取 team preferences 失败也能继续使用环境变量

## 使用方法

### 配置步骤

1. 以管理员身份登录系统
2. 进入 Settings > AI
3. 滚动到 "Transcription" 部分
4. 在 "Transcription endpoint" 输入框中输入转录服务的 URL
   - 例如: `http://v.netis.com.cn:13000/transcribe`
5. 输入完成后失焦（blur）会自动保存
6. 留空则使用环境变量中的默认值

### 优先级

配置的优先级如下：
1. Team Preferences 中的配置（最高优先级）
2. 环境变量 `TRANSCRIPTION_ENDPOINT`
3. 默认值: `http://v.netis.com.cn:13000/transcribe`

## 技术细节

### 数据流

```
用户在 AI Settings 界面配置
    ↓
保存到 Team.preferences.transcriptionEndpoint
    ↓
TranscriptionTask 执行时读取
    ↓
使用配置的 endpoint 发送转录请求
```

### 日志记录

当使用 team 配置的 endpoint 时，会记录以下日志：

```typescript
Logger.info("task", "Using team-configured transcription endpoint", {
  jobId,
  teamId: job.teamId,
  endpoint: transcriptionEndpoint,
});
```

如果读取 team preferences 失败，会记录警告日志：

```typescript
Logger.warn("Failed to load team transcription endpoint, using environment default", {
  jobId,
  teamId: job.teamId,
  error: error.message,
});
```

## 兼容性

- 向后兼容：如果没有配置 team preferences，系统会自动使用环境变量
- 不影响现有功能：所有现有的转录功能保持不变
- 只有管理员可以访问和修改 AI Settings

## 测试建议

1. 测试使用 team preferences 配置的 endpoint
2. 测试留空时使用环境变量的默认值
3. 测试配置无效 endpoint 时的错误处理
4. 测试非管理员用户无法访问 AI Settings
5. 测试配置保存和读取的正确性
