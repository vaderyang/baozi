# 转录自动摘要幻觉问题修复

## 问题描述

录音转录后的自动摘要功能存在严重的"幻觉"问题：
- 转录内容只有一句话："怎么回事？"
- 但AI生成了一大段完全不相关的会议记录内容（包括项目进度、参会人员、议题等虚假信息）
- 这是因为LLM在内容不足时会"幻觉"生成虚假信息

## 根本原因

1. **前端提示词不够严格**（`app/editor/components/TranscriptionStatusManager.tsx`）：
   - 原提示词：简单要求"Summarize the following transcript..."
   - 没有明确禁止添加外部信息
   - 没有处理内容不足的情况

2. **后端系统指令不够严格**（`server/routes/api/ai/ai.ts`）：
   - 原指令：只说"be professional thinking the sections and the format"
   - 没有明确要求只使用提供的上下文
   - 没有禁止编造信息

## 修复方案

### 1. 前端提示词强化（TranscriptionStatusManager.tsx）

**修改位置**：第283-295行

**修改前**：
```typescript
const prompt =
  "Summarize the following transcript by using the language mainly used in the transcript, if you cannot determine, by default use Chinese(zh-CN). you need to design the best minutes format for the transcript, e.g. professional meeting minutes, interview minutes, personal notes and etc. :";
```

**修改后**：
```typescript
const prompt =
  "CRITICAL RULES:\n" +
  "1. ONLY use information from the provided transcript below - DO NOT add any external information or make up content\n" +
  "2. If the transcript is too short or unclear, simply state that the content is insufficient for a summary\n" +
  "3. Use the same language as the transcript (default to Chinese/zh-CN if unclear)\n" +
  "4. Design an appropriate format based on the transcript content (e.g., meeting minutes, interview notes, personal memo)\n" +
  "5. If the transcript only contains a single sentence or question, just restate it clearly without elaboration\n\n" +
  "Summarize the following transcript:";
```

**关键改进**：
- ✅ 明确禁止添加外部信息或编造内容
- ✅ 处理内容不足的情况（要求说明内容不足）
- ✅ 处理单句转录（只需重述，不要扩展）
- ✅ 使用"CRITICAL RULES"强调重要性

### 2. 后端系统指令强化（ai.ts）

**修改位置**：第2161-2167行

**修改前**：
```typescript
let instructions =
  "You write Markdown Text upon user's request" +
  "Always emit valid Markdown that renders correctly. " +
  "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
  "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text." +
  "If writing a meeting minutes or so, be professional thinking the sections and the format.";
```

**修改后**：
```typescript
let instructions =
  "You write Markdown Text upon user's request. " +
  "Always emit valid Markdown that renders correctly. " +
  "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
  "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text. " +
  "If writing a meeting minutes or summary, be professional thinking the sections and the format. " +
  "CRITICAL: When summarizing or processing provided context, ONLY use information from that context - DO NOT add external information or make up content. " +
  "If the provided context is insufficient or unclear, state that clearly instead of fabricating information.";
```

**关键改进**：
- ✅ 添加"CRITICAL"级别的反幻觉指令
- ✅ 明确要求只使用提供的上下文
- ✅ 禁止添加外部信息或编造内容
- ✅ 要求在内容不足时明确说明

## 测试场景

### 场景1：单句转录
**输入**：
```
spk 0: 怎么回事？
```

**期望输出**（修复后）：
```
转录内容较短，仅包含一个问题："怎么回事？"。无法生成详细摘要。
```

**不应该输出**（修复前的错误）：
```
会议主题: 项目进度同步与问题讨论
会议时间: 2025年4月5日 14:00-15:30
参会人员: 张伟（项目经理）、李娜（开发主管）...
（大量虚假信息）
```

### 场景2：短对话
**输入**：
```
spk 0: 今天开会吗？
spk 1: 不开了，改到明天。
```

**期望输出**：
```
简短对话记录：
- 询问今天是否开会
- 回复会议改到明天
```

### 场景3：完整会议
**输入**：
```
spk 0: 大家好，今天讨论一下项目进度...
（完整的会议内容）
```

**期望输出**：
```
会议摘要：
1. 会议主题：项目进度讨论
2. 主要内容：...
（基于实际转录内容的摘要）
```

## 影响范围

- ✅ 所有使用自动摘要功能的录音转录
- ✅ 所有通过`/ai.generate` API生成的内容（包括摘要、会议记录等）
- ✅ 提高了AI生成内容的可靠性和准确性

## 回滚方案

如果需要回滚，恢复以下文件的修改：
1. `app/editor/components/TranscriptionStatusManager.tsx` - 第283-295行
2. `server/routes/api/ai/ai.ts` - 第2161-2167行

## 相关文件

- `app/editor/components/TranscriptionStatusManager.tsx` - 前端转录状态管理和摘要生成
- `server/routes/api/ai/ai.ts` - 后端AI生成API
- `server/queues/tasks/TranscriptionTask.ts` - 转录任务处理（未修改）
- `server/models/TranscriptionJob.ts` - 转录任务模型（未修改）
