# 转写功能日志增强

## 概述

为了更好地诊断生产环境中转写功能的问题，我在整个转写流程中添加了详细的日志记录，包括：
- 服务器端：文件下载、ASR请求、响应处理、数据库更新
- 前端：轮询、状态检查、格式转换、文档插入

## 服务器端日志增强 (TranscriptionTask.ts)

### 1. 文件下载阶段

**日志位置：** 下载音频文件时

**记录信息：**
- 文件名、内容类型、文件大小
- 下载开始时间
- 下载完成后的字节数
- 下载耗时（毫秒）
- 存储类型（本地/S3）

**示例日志：**
```
[INFO] task: Downloading audio file
  jobId: xxx
  attachmentId: xxx
  fileName: audio.mp3
  contentType: audio/mpeg
  fileSize: 1234567

[INFO] task: Read audio file from local storage
  jobId: xxx
  filePath: /path/to/file
  fileSizeBytes: 1234567
  downloadDurationMs: 45
```

### 2. FormData 创建阶段

**日志位置：** 创建 FormData 对象时

**记录信息：**
- 文件名、内容类型
- Buffer 大小（字节）
- FormData 创建耗时

**示例日志：**
```
[INFO] task: Created FormData for transcription request
  jobId: xxx
  attachmentId: xxx
  fileName: audio.mp3
  contentType: audio/mpeg
  bufferSizeBytes: 1234567
  formDataCreationMs: 2
```

### 3. ASR 请求阶段

**日志位置：** 发送请求到 ASR 服务器时

**记录信息：**
- ASR 端点 URL
- 文件大小（字节）
- 文件名

**示例日志：**
```
[INFO] task: Sending transcription request to ASR server
  jobId: xxx
  attachmentId: xxx
  endpoint: http://172.16.103.100:8000/transcribe
  fileSizeBytes: 1234567
  fileName: audio.mp3
```

### 4. ASR 响应阶段

**日志位置：** 收到 ASR 服务器响应时

**记录信息：**
- HTTP 状态码和状态文本
- 请求耗时（毫秒）
- 响应内容类型
- 响应内容长度

**示例日志：**
```
[INFO] task: Received response from ASR server
  jobId: xxx
  attachmentId: xxx
  statusCode: 200
  statusText: OK
  requestDurationMs: 15234
  contentType: application/json
  contentLength: 5678
```

**错误情况：**
```
[ERROR] Transcription service error
  jobId: xxx
  attachmentId: xxx
  status: 500
  statusText: Internal Server Error
  errorText: [前500字符的错误信息]
  requestDurationMs: 1234
```

### 5. 结果解析阶段

**日志位置：** 解析 ASR 返回的 JSON 时

**记录信息：**
- 解析耗时
- 是否包含文本
- 文本长度
- 是否包含说话人分段
- 说话人分段数量
- 结果对象的所有键

**示例日志：**
```
[INFO] task: Parsed transcription result from ASR server
  jobId: xxx
  attachmentId: xxx
  parseDurationMs: 5
  hasText: true
  textLength: 1234
  hasSpeakerSegments: true
  speakerSegmentCount: 15
  resultKeys: ["text", "speaker_segments"]
```

### 6. 说话人分析阶段

**日志位置：** 如果有说话人分段数据

**记录信息：**
- 唯一说话人数量
- 说话人 ID 列表
- 第一个和最后一个分段的详细信息

**示例日志：**
```
[INFO] task: Speaker segment analysis
  jobId: xxx
  uniqueSpeakerCount: 2
  uniqueSpeakers: [0, 1]
  firstSegment: { spk: 0, text: "...", start: 0, end: 1234 }
  lastSegment: { spk: 1, text: "...", start: 45678, end: 50000 }
```

### 7. 数据库更新阶段

**日志位置：** 更新任务状态为完成时

**记录信息：**
- 数据库更新耗时

**示例日志：**
```
[INFO] task: Updated job status to completed in database
  jobId: xxx
  attachmentId: xxx
  dbUpdateDurationMs: 23
```

### 8. 总体统计阶段

**日志位置：** 任务完成时

**记录信息：**
- 总耗时
- 各阶段耗时分解
- 文件大小
- 转写结果统计

**示例日志：**
```
[INFO] task: Transcription task completed successfully
  jobId: xxx
  attachmentId: xxx
  totalDurationMs: 15305
  downloadDurationMs: 45
  asrRequestDurationMs: 15234
  parseDurationMs: 5
  dbUpdateDurationMs: 23
  fileSizeBytes: 1234567
  textLength: 1234
  speakerSegmentCount: 15
```

## 前端日志增强 (TranscriptionStatusManager.tsx)

### 1. 格式化转写文本阶段

**日志位置：** `formatTranscriptText` 函数

**记录信息：**
- 格式化方法（speaker_segments / speaker_labels_in_text / sentence_breaks）
- 原始文本长度
- 格式化后文本长度
- 行数
- 说话人信息（如果有）

**示例日志：**
```
[INFO] editor: Formatting transcript with speaker segments
  segmentCount: 15
  uniqueSpeakerCount: 2
  uniqueSpeakers: [0, 1]
  originalTextLength: 1234

[INFO] editor: Transcript formatting completed
  formatMethod: speaker_segments
  originalLength: 1234
  formattedLength: 1456
  lineCount: 30
```

### 2. 替换状态卡片阶段

**日志位置：** `replaceStatusCardWithTranscript` 函数开始

**记录信息：**
- 任务 ID
- 是否有结果
- 是否有附件

**示例日志：**
```
[INFO] editor: Attempting to replace status card
  jobId: xxx
  hasResult: true
  hasAttachment: true
```

### 3. 查找状态卡片阶段

**日志位置：** 在文档中查找状态卡片时

**记录信息：**
- 卡片位置
- 文件名

**示例日志：**
```
[INFO] editor: Found status card, preparing to replace
  jobId: xxx
  position: 123
  fileName: audio.mp3
```

**未找到情况：**
```
[WARN] Status card not found for completed transcription
  jobId: xxx
  documentNodeCount: 45
```

### 4. 构建 Markdown 内容阶段

**日志位置：** 构建要插入的 markdown 内容时

**记录信息：**
- 是否包含音频附件
- Markdown 长度
- 转写标题
- 格式化文本长度

**示例日志：**
```
[INFO] editor: Added audio attachment to markdown
  jobId: xxx
  attachmentId: xxx
  fileName: audio.mp3
  fileSize: 1234567
  attachmentUrl: /api/attachments.redirect?id=xxx

[INFO] editor: Built markdown content for transcript
  jobId: xxx
  markdownLength: 1567
  hasAttachment: true
  transcriptHeading: Transcript
  formattedTextLength: 1456
```

### 5. Markdown 规范化阶段

**日志位置：** 规范化 markdown 内容时

**记录信息：**
- 规范化耗时
- 原始长度
- 规范化后长度

**示例日志：**
```
[DEBUG] editor: Normalized markdown
  jobId: xxx
  normalizeDurationMs: 2
  originalLength: 1567
  normalizedLength: 1570
```

### 6. Markdown 解析阶段

**日志位置：** 解析 markdown 为 ProseMirror 节点时

**记录信息：**
- 解析耗时
- Slice 大小
- 子节点数量

**示例日志：**
```
[INFO] editor: Parsed transcript content successfully
  jobId: xxx
  parseDurationMs: 8
  sliceSize: 1234
  sliceChildCount: 12
  contentMarkdownLength: 1567
```

**解析失败：**
```
[WARN] Failed to parse transcript markdown
  jobId: xxx
  contentMarkdownLength: 1567
  contentMarkdownPreview: [前100字符]
```

### 7. 文档插入阶段

**日志位置：** 成功插入转写内容后

**记录信息：**
- 插入位置

**示例日志：**
```
[INFO] editor: Successfully replaced status card with transcript
  jobId: xxx
  insertionEnd: 1357
```

### 8. 轮询状态更新阶段

**日志位置：** 轮询检查任务状态时

**记录信息：**
- 文档 ID
- 状态卡片数量
- 任务 ID 列表

**示例日志：**
```
[DEBUG] editor: Polling status for cards
  documentId: xxx
  cardCount: 2
  jobIds: ["job1", "job2"]
```

### 9. 接收任务状态阶段

**日志位置：** 收到任务状态响应时

**记录信息：**
- 任务状态
- 是否有结果
- 附件 ID

**示例日志：**
```
[DEBUG] editor: Received job status
  jobId: xxx
  status: completed
  hasResult: true
  attachmentId: xxx
```

### 10. 任务完成处理阶段

**日志位置：** 检测到任务完成时

**记录信息：**
- 是否有结果
- 是否有附件
- 文本长度
- 说话人分段数量

**示例日志：**
```
[INFO] editor: Job completed, replacing status card
  jobId: xxx
  hasResult: true
  hasAttachment: true
  textLength: 1234
  speakerSegmentCount: 15
```

### 11. 恢复缺失的状态卡片

**日志位置：** 发现有 pending jobs 但没有状态卡片时

**记录信息：**
- 文档 ID
- Pending jobs 数量
- 任务 ID 列表

**示例日志：**
```
[INFO] editor: Found pending jobs without status cards, inserting them
  documentId: xxx
  count: 2
  jobIds: ["job1", "job2"]
```

## 使用这些日志进行诊断

### 场景 1: 转写任务卡在 "processing" 状态

**检查日志：**
1. 搜索 `Sending transcription request to ASR server` - 确认请求已发送
2. 搜索 `Received response from ASR server` - 检查是否收到响应
3. 检查 `requestDurationMs` - 如果很长，说明 ASR 服务器处理慢
4. 搜索 `Parsed transcription result` - 确认结果已解析
5. 搜索 `Updated job status to completed` - 确认数据库已更新

### 场景 2: 转写完成但文档中没有显示

**检查日志：**
1. 搜索 `Job completed, replacing status card` - 确认前端检测到完成
2. 搜索 `Attempting to replace status card` - 确认开始替换
3. 搜索 `Found status card, preparing to replace` - 确认找到了卡片
4. 搜索 `Parsed transcript content successfully` - 确认内容解析成功
5. 搜索 `Successfully replaced status card` - 确认插入成功

**如果找不到 "Found status card"：**
- 说明文档中没有状态卡片
- 检查 `Found pending jobs without status cards` - 看是否尝试恢复

### 场景 3: 性能问题

**检查日志中的耗时：**
- `downloadDurationMs` - 文件下载耗时
- `asrRequestDurationMs` - ASR 处理耗时（主要瓶颈）
- `parseDurationMs` - JSON 解析耗时
- `dbUpdateDurationMs` - 数据库更新耗时
- `normalizeDurationMs` - Markdown 规范化耗时
- `parseDurationMs` (前端) - Markdown 解析耗时

### 场景 4: 说话人分段问题

**检查日志：**
1. 搜索 `Speaker segment analysis` - 查看说话人数量和分段信息
2. 搜索 `Formatting transcript with speaker segments` - 确认使用了正确的格式化方法
3. 检查 `uniqueSpeakerCount` 和 `uniqueSpeakers` - 验证说话人识别

## 日志级别建议

### 开发环境
```bash
LOG_LEVEL=debug
DEBUG=*
```

### 生产环境（正常运行）
```bash
LOG_LEVEL=info
DEBUG=task,editor
```

### 生产环境（调试问题）
```bash
LOG_LEVEL=debug
DEBUG=*
```

## 查看日志的命令

### Docker 环境
```bash
# 查看所有转写相关日志
docker logs outline-server 2>&1 | grep -i transcription

# 查看特定任务的日志
docker logs outline-server 2>&1 | grep "jobId: xxx"

# 实时查看日志
docker logs -f outline-server | grep -i transcription
```

### 本地开发
```bash
# 日志会直接输出到控制台
# 可以使用 grep 过滤
yarn dev | grep -i transcription
```

### 浏览器控制台
```javascript
// 过滤转写相关日志
// 在控制台中输入：
localStorage.setItem('debug', 'editor,task');
// 然后刷新页面
```

## 性能基准

基于日志数据，可以建立性能基准：

### 正常情况下的预期耗时
- 文件下载：< 100ms（本地存储）或 < 1000ms（S3）
- FormData 创建：< 10ms
- ASR 请求：取决于音频长度，通常 1-30 秒
- JSON 解析：< 10ms
- 数据库更新：< 50ms
- Markdown 规范化：< 5ms
- Markdown 解析：< 20ms

### 异常情况
- 如果 `downloadDurationMs` > 5000ms - 网络问题
- 如果 `asrRequestDurationMs` > 60000ms - ASR 服务器过载或音频太长
- 如果 `dbUpdateDurationMs` > 500ms - 数据库性能问题
- 如果 `parseDurationMs` > 100ms - 转写结果太大

## 总结

通过这些详细的日志，你可以：
1. **追踪整个转写流程** - 从文件上传到结果插入
2. **定位性能瓶颈** - 通过各阶段的耗时统计
3. **诊断失败原因** - 通过错误日志和状态检查
4. **验证数据完整性** - 通过字节数、长度等统计信息
5. **监控生产环境** - 建立性能基准和告警阈值
