# 转写功能生产环境修复 V2

## 问题分析

生产系统中音频能够正确上传，ASR服务器也处理了请求，但转写完成后document里没有显示。

### 根本原因

经过代码分析，发现以下潜在问题：

1. **Status Card 未恢复**：用户上传音频后如果关闭文档，再次打开时 pending jobs 的 status cards 可能没有被正确恢复
2. **轮询未启动**：如果文档中没有 status card，轮询机制不会触发
3. **attachmentId 缺失**：虽然 API 返回了 attachmentId，但在某些情况下可能为空

## 解决方案

### 方案 1: 增强 Pending Jobs 恢复逻辑

修改 `TranscriptionStatusManager.tsx`，确保在文档加载时正确恢复所有 pending jobs：

```typescript
// 在 loadPendingJobs 函数中添加更多日志和错误处理
const loadPendingJobs = async () => {
  if (!documentId || pendingJobsLoaded) {
    return;
  }

  try {
    Logger.info("editor", "Loading pending transcription jobs", {
      documentId,
    });

    const response = await client.post<{
      data: Array<{
        id: string;
        status: "queued" | "processing";
        progress: number | null;
        error: string | null;
        fileName: string;
        fileSize: number;
      }>;
    }>("/transcriptions.list", {
      documentId,
    });

    const pendingJobs = response.data;

    Logger.info("editor", "Pending jobs loaded", {
      documentId,
      count: pendingJobs.length,
      jobIds: pendingJobs.map(j => j.id),
    });

    if (pendingJobs.length === 0) {
      setPendingJobsLoaded(true);
      return;
    }

    // ... rest of the code
  } catch (error) {
    Logger.error(
      "Failed to load pending transcription jobs",
      error as Error,
      { documentId }
    );
    setPendingJobsLoaded(true);
  }
};
```

### 方案 2: 添加完成任务的自动检查

即使没有 status card，也应该检查是否有已完成但未插入的转写结果：

```typescript
// 在 loadPendingJobs 后添加检查已完成任务的逻辑
const checkCompletedJobs = async () => {
  try {
    // 查询最近完成的任务
    const response = await client.post<{
      data: Array<{
        id: string;
        status: "completed";
        result: TranscriptionResult;
        attachmentId: string;
        createdAt: string;
      }>;
    }>("/transcriptions.listCompleted", {
      documentId,
      limit: 10, // 最近10个
    });

    const completedJobs = response.data;

    // 检查这些任务的结果是否已经在文档中
    for (const job of completedJobs) {
      // 搜索文档中是否包含这个转写结果
      const hasResult = searchDocumentForTranscript(job.id);
      
      if (!hasResult && job.result) {
        // 如果没有，自动插入
        Logger.info("editor", "Found completed job without result in document", {
          jobId: job.id,
        });
        
        // 在文档末尾插入转写结果
        insertTranscriptAtEnd(job.id, job.result, job.attachmentId);
      }
    }
  } catch (error) {
    Logger.error("Failed to check completed jobs", error as Error);
  }
};
```

### 方案 3: 添加新的 API 端点

在服务器端添加一个新的 API 端点来查询已完成的任务：

```typescript
// server/routes/api/transcriptions/transcriptions.ts

router.post(
  "transcriptions.listCompleted",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth(),
  validate(T.TranscriptionListCompletedSchema),
  async (ctx: APIContext<T.TranscriptionListCompletedReq>) => {
    const { user } = ctx.state.auth;
    const { documentId, limit = 10 } = ctx.input.body;

    // Find the document and verify access
    const document = await Document.findByPk(documentId, {
      userId: user.id,
    });

    if (!document) {
      throw NotFoundError("Document not found");
    }

    authorize(user, "read", document);

    // Query completed transcription jobs for this document
    const jobs = await TranscriptionJob.findAll({
      where: {
        documentId,
        status: TranscriptionJobStatus.Completed,
        result: {
          [Op.ne]: null,
        },
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    ctx.body = {
      data: jobs.map(job => ({
        id: job.id,
        status: job.status,
        result: job.result,
        attachmentId: job.attachmentId,
        createdAt: job.createdAt,
      })),
    };
  }
);
```

### 方案 4: 简化方案 - 修复轮询逻辑

最简单的修复是确保轮询在没有 status card 时也能检查已完成的任务：

```typescript
// 修改 pollStatusUpdates 函数
const pollStatusUpdates = async () => {
  try {
    const { view } = editorRef.current;
    if (!view) {
      return;
    }

    // Find all status card nodes in the document
    const statusCards: Array<{ jobId: string; pos: number }> = [];
    view.state.doc.descendants((node, pos) => {
      if (
        node.type.name === "transcription_status_card" &&
        node.attrs.jobId
      ) {
        statusCards.push({ jobId: node.attrs.jobId, pos });
      }
      return true;
    });

    // 即使没有 status cards，也检查是否有 pending jobs
    if (statusCards.length === 0) {
      // 检查是否有 pending jobs
      try {
        const response = await client.post<{
          data: Array<{
            id: string;
            status: "queued" | "processing";
            progress: number | null;
            error: string | null;
            fileName: string;
            fileSize: number;
          }>;
        }>("/transcriptions.list", {
          documentId,
        });

        const pendingJobs = response.data;

        // 如果有 pending jobs 但没有 status cards，插入它们
        if (pendingJobs.length > 0) {
          Logger.info("editor", "Found pending jobs without status cards", {
            count: pendingJobs.length,
          });

          const { commands } = editorRef.current;
          if (commands.insertTranscriptionStatusCard) {
            for (const job of pendingJobs) {
              const { state, dispatch } = view;
              const { tr, doc } = state;
              const endPos = doc.content.size;

              const node =
                view.state.schema.nodes.transcription_status_card.create({
                  jobId: job.id,
                  fileName: job.fileName,
                  fileSize: job.fileSize,
                  status: job.status,
                  progress: job.progress || 0,
                  error: job.error,
                });

              tr.insert(endPos, node);
              dispatch(tr);
            }
          }
        }
      } catch (error) {
        // Silently ignore errors
      }
      return;
    }

    // ... rest of the polling logic for existing status cards
  } catch (error) {
    Logger.error("Failed to poll transcription status", error as Error);
  }
};
```

## 推荐实施步骤

### 立即实施（最小改动）

1. **增加日志**：在关键位置添加更多日志，帮助诊断问题
2. **修复轮询**：确保轮询在没有 status card 时也能检查 pending jobs

### 短期实施

1. **增强恢复逻辑**：改进 `loadPendingJobs` 函数，添加更好的错误处理
2. **添加重试机制**：如果 pending jobs 加载失败，自动重试

### 长期实施

1. **添加 listCompleted API**：允许前端查询已完成但可能未插入的任务
2. **添加自动恢复**：定期检查是否有遗漏的转写结果

## 临时解决方案

如果问题紧急，可以提供一个手动恢复的功能：

```typescript
// 添加一个命令来手动检查和插入遗漏的转写结果
commands.recoverMissingTranscripts = () => {
  return async () => {
    try {
      const response = await client.post("/transcriptions.listCompleted", {
        documentId,
        limit: 10,
      });

      const completedJobs = response.data;

      for (const job of completedJobs) {
        // 检查是否已在文档中
        let found = false;
        view.state.doc.descendants((node) => {
          if (
            node.type.name === "transcription_status_card" &&
            node.attrs.jobId === job.id
          ) {
            found = true;
            return false;
          }
          return true;
        });

        if (!found && job.result) {
          // 在文档末尾插入
          insertTranscriptAtEnd(job.id, job.result, job.attachmentId);
        }
      }

      toast.success("Recovered missing transcripts");
    } catch (error) {
      toast.error("Failed to recover transcripts");
    }
  };
};
```

## 测试计划

1. **测试场景 1**：上传音频，等待转写完成
   - 预期：status card 自动更新并替换为转写结果

2. **测试场景 2**：上传音频，关闭文档，等待转写完成，重新打开文档
   - 预期：自动恢复 pending jobs 的 status cards，然后更新

3. **测试场景 3**：上传音频，转写完成，但前端没有更新，刷新页面
   - 预期：检测到已完成的任务并自动插入结果

4. **测试场景 4**：多个音频同时转写
   - 预期：所有 status cards 都能正确更新

## 监控和日志

在生产环境中，确保以下日志被记录：

1. **任务创建**：`Created transcription job`
2. **任务完成**：`Transcription completed successfully`
3. **Pending jobs 加载**：`Loading pending transcription jobs`
4. **轮询触发**：`Polling status updates`
5. **Status card 替换**：`Job completed, replacing status card`

通过这些日志，可以快速定位问题发生在哪个环节。
