# 转写功能调试指南

## 问题描述
生产系统中音频能够正确上传，ASR服务器也看到了请求正确被处理，但在转写完成后，document里没有任何显示。

## 可能的原因

### 1. 数据库状态未更新
**检查方法：**
```sql
-- 查看最近的转写任务
SELECT id, status, progress, error, result, "createdAt", "updatedAt"
FROM transcription_jobs
ORDER BY "createdAt" DESC
LIMIT 10;

-- 查看特定任务的详细信息
SELECT *
FROM transcription_jobs
WHERE id = 'your-job-id';
```

**预期结果：**
- status 应该是 'completed'
- result 字段应该包含转写文本和speaker segments
- progress 应该是 100

**如果状态不是 completed：**
- 检查服务器日志，看 TranscriptionTask 是否成功完成
- 检查是否有异常抛出

### 2. 前端轮询未找到 Status Card
**检查方法：**
在浏览器控制台运行：
```javascript
// 检查编辑器中是否有 status card
const editor = document.querySelector('.ProseMirror');
const statusCards = editor.querySelectorAll('[data-node-type="transcription_status_card"]');
console.log('Status cards found:', statusCards.length);
statusCards.forEach((card, i) => {
  console.log(`Card ${i}:`, card.getAttribute('data-job-id'));
});
```

**预期结果：**
- 如果转写正在进行，应该能找到对应的 status card
- 如果找不到 status card，轮询不会触发

**如果找不到 status card：**
- 检查文档加载时是否调用了 `transcriptions.list` API
- 检查是否正确插入了 pending jobs 的 status cards

### 3. 轮询 API 调用失败
**检查方法：**
在浏览器开发者工具的 Network 标签中：
1. 过滤 `transcriptions.info`
2. 查看是否每5秒有请求
3. 检查响应状态和内容

**预期结果：**
- 每5秒应该有一次 `transcriptions.info` 请求
- 响应应该包含正确的 job 状态

**如果没有请求：**
- 检查 TranscriptionStatusManager 组件是否正确挂载
- 检查 pendingJobsLoaded 状态

### 4. replaceStatusCardWithTranscript 失败
**检查方法：**
在浏览器控制台查看是否有错误日志：
```javascript
// 查看最近的日志
// 应该能看到 "Job completed, replacing status card" 的日志
```

**可能的问题：**
- pasteParser 解析失败
- 找不到 status card 的位置
- 事务冲突

### 5. 生产环境日志级别过高
**检查方法：**
查看 `.env` 文件中的日志配置：
```bash
LOG_LEVEL=debug  # 应该设置为 debug 或 info
DEBUG=*          # 或至少包含 editor,task
```

**如果日志级别是 error 或 warn：**
- 可能看不到关键的调试信息
- 建议临时设置为 debug

## 调试步骤

### 步骤 1: 检查服务器日志
```bash
# 查看最近的转写任务日志
grep "transcription" /path/to/logs | tail -100

# 或者如果使用 Docker
docker logs outline-server | grep transcription | tail -100
```

**关键日志：**
- `Starting transcription task` - 任务开始
- `Transcription completed successfully` - ASR 返回成功
- `Job completed, replacing status card` - 前端准备替换卡片

### 步骤 2: 检查数据库
```sql
-- 查看最近的任务
SELECT 
  id,
  status,
  progress,
  error,
  result IS NOT NULL as has_result,
  "createdAt",
  "updatedAt"
FROM transcription_jobs
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC;
```

### 步骤 3: 检查前端状态
在浏览器控制台：
```javascript
// 1. 检查是否有 status cards
document.querySelectorAll('[data-node-type="transcription_status_card"]').length

// 2. 检查网络请求
// 打开 Network 标签，过滤 "transcriptions"
// 应该看到定期的 transcriptions.info 请求

// 3. 检查 localStorage（如果有缓存）
localStorage.getItem('transcription_jobs')
```

### 步骤 4: 手动触发轮询
如果怀疑轮询没有工作，可以手动调用 API：
```javascript
// 在浏览器控制台
fetch('/api/transcriptions.info', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ jobId: 'your-job-id' })
})
.then(r => r.json())
.then(console.log);
```

## 常见问题和解决方案

### 问题 1: Job 状态是 completed 但前端没有更新
**原因：** 前端轮询可能没有运行或找不到 status card

**解决方案：**
1. 刷新页面，检查是否会加载 pending jobs
2. 检查 TranscriptionStatusManager 是否正确挂载
3. 检查浏览器控制台是否有 JavaScript 错误

### 问题 2: Job 状态一直是 processing
**原因：** TranscriptionTask 可能失败但没有正确更新状态

**解决方案：**
1. 检查服务器日志中的错误
2. 检查 ASR 服务器是否真的返回了结果
3. 检查数据库连接是否正常

### 问题 3: 轮询请求返回 404 或 401
**原因：** API 路由配置问题或认证问题

**解决方案：**
1. 检查 API 路由是否正确注册
2. 检查用户是否有权限访问该文档
3. 检查 session 是否过期

### 问题 4: replaceStatusCardWithTranscript 被调用但没有效果
**原因：** ProseMirror 事务可能失败

**解决方案：**
1. 检查浏览器控制台的错误日志
2. 检查 pasteParser 是否正确初始化
3. 检查 markdown 格式是否正确

## 临时解决方案

如果问题紧急，可以尝试以下临时方案：

### 方案 1: 手动刷新页面
转写完成后，刷新页面应该会触发 `transcriptions.list` 加载 pending jobs。

### 方案 2: 减少轮询间隔
修改 `TranscriptionStatusManager.tsx`：
```typescript
// 从 5000ms 改为 2000ms
const intervalId = setInterval(() => {
  void pollStatusUpdates();
}, 2000);  // 更频繁的轮询
```

### 方案 3: 添加更多日志
在 `TranscriptionStatusManager.tsx` 的关键位置添加日志：
```typescript
Logger.info("editor", "Polling status updates", {
  statusCardsCount: statusCards.length,
  jobIds: statusCards.map(c => c.jobId)
});
```

## 生产环境特殊检查

### 检查 1: 确认 worker 服务正在运行
```bash
# 检查 SERVICES 环境变量
echo $SERVICES  # 应该包含 "worker"

# 检查进程
ps aux | grep worker
```

### 检查 2: 确认 Redis 连接正常
```bash
# 测试 Redis 连接
redis-cli -u $REDIS_URL ping
# 应该返回 PONG

# 查看队列中的任务
redis-cli -u $REDIS_URL LLEN bull:transcription:wait
```

### 检查 3: 确认数据库事务正常
```sql
-- 检查是否有长时间运行的事务
SELECT pid, state, query_start, query
FROM pg_stat_activity
WHERE state != 'idle'
AND query_start < NOW() - INTERVAL '1 minute';
```

## 下一步行动

根据上述检查结果：

1. **如果数据库中 job 状态是 completed**
   - 问题在前端轮询或 status card 查找
   - 检查前端日志和网络请求

2. **如果数据库中 job 状态不是 completed**
   - 问题在后端任务执行
   - 检查服务器日志和 worker 进程

3. **如果前端找不到 status card**
   - 问题在文档加载时的 pending jobs 恢复
   - 检查 `transcriptions.list` API 调用

4. **如果轮询没有触发**
   - 问题在 TranscriptionStatusManager 组件
   - 检查组件是否正确挂载和 useEffect 依赖
