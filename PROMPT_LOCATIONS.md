# 转录自动摘要 Prompt 位置和内容

## 1. 前端 Prompt（用户请求层）

### 文件位置
`app/editor/components/TranscriptionStatusManager.tsx`

### 代码位置
**第 246-254 行**

### 完整 Prompt 内容
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

### API 调用
```typescript
const response = await client.post<{ data: { text?: string } }>(
  "/ai.generate",
  {
    prompt,           // 上面的 prompt
    context: formattedText,  // 转录文本内容
  },
  { retry: false }
);
```

### 实际发送给 LLM 的内容结构
```
System Instructions: (来自后端)
User Prompt: "CRITICAL RULES:..."
Context: "spk 0: 怎么回事？"  (转录内容)
```

---

## 2. 后端系统指令（System Instructions）

### 文件位置
`server/routes/api/ai/ai.ts`

### 代码位置
**第 2145-2151 行**

### 完整系统指令内容
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

### 发送给 LLM 的消息结构
```typescript
const messages = [
  {
    role: "system",
    content: instructions  // 上面的系统指令
  },
  context ? {
    role: "assistant",
    content: context  // 转录文本（作为上下文）
  } : undefined,
  {
    role: "user",
    content: userPrompt  // 前端发送的 prompt
  }
].filter(Boolean);
```

---

## 3. 完整的 LLM 请求示例

### 场景：转录内容为 "怎么回事？"

```json
{
  "model": "qwen3-30b-a3b-instruct",
  "messages": [
    {
      "role": "system",
      "content": "You write Markdown Text upon user's request. Always emit valid Markdown that renders correctly. IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text. If writing a meeting minutes or summary, be professional thinking the sections and the format. CRITICAL: When summarizing or processing provided context, ONLY use information from that context - DO NOT add external information or make up content. If the provided context is insufficient or unclear, state that clearly instead of fabricating information."
    },
    {
      "role": "assistant",
      "content": "spk 0: 怎么回事？"
    },
    {
      "role": "user",
      "content": "CRITICAL RULES:\n1. ONLY use information from the provided transcript below - DO NOT add any external information or make up content\n2. If the transcript is too short or unclear, simply state that the content is insufficient for a summary\n3. Use the same language as the transcript (default to Chinese/zh-CN if unclear)\n4. Design an appropriate format based on the transcript content (e.g., meeting minutes, interview notes, personal memo)\n5. If the transcript only contains a single sentence or question, just restate it clearly without elaboration\n\nSummarize the following transcript:"
    }
  ]
}
```

---

## 4. 关键修改点对比

### 前端 Prompt

#### 修改前（会导致幻觉）
```typescript
const prompt = 
  "Summarize the following transcript by using the language mainly used in the transcript, if you cannot determine, by default use Chinese(zh-CN). you need to design the best minutes format for the transcript, e.g. professional meeting minutes, interview minutes, personal notes and etc. :";
```

**问题**：
- ❌ 没有禁止添加外部信息
- ❌ 没有处理内容不足的情况
- ❌ 没有处理单句转录的情况

#### 修改后（防止幻觉）
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

**改进**：
- ✅ 明确禁止添加外部信息（规则1）
- ✅ 处理内容不足的情况（规则2）
- ✅ 处理单句转录（规则5）
- ✅ 使用"CRITICAL RULES"强调重要性

### 后端系统指令

#### 修改前（会导致幻觉）
```typescript
let instructions =
  "You write Markdown Text upon user's request" +
  "Always emit valid Markdown that renders correctly. " +
  "IMPORTANT: Do NOT wrap your output in triple backticks (```) unless the user explicitly requests code blocks or code formatting. " +
  "When asked for a diagram, respond with a fenced mermaid code block using ```mermaid and omit any surrounding text." +
  "If writing a meeting minutes or so, be professional thinking the sections and the format.";
```

**问题**：
- ❌ 没有禁止添加外部信息
- ❌ 没有要求只使用提供的上下文

#### 修改后（防止幻觉）
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

**改进**：
- ✅ 添加"CRITICAL"级别的反幻觉指令
- ✅ 明确要求只使用提供的上下文
- ✅ 禁止添加外部信息或编造内容
- ✅ 要求在内容不足时明确说明

---

## 5. 测试验证

### 测试用例 1：单句转录
**输入转录**：
```
spk 0: 怎么回事？
```

**期望输出**：
```
转录内容较短，仅包含一个问题："怎么回事？"。无法生成详细摘要。
```

### 测试用例 2：短对话
**输入转录**：
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

### 测试用例 3：完整会议
**输入转录**：
```
spk 0: 大家好，今天我们讨论一下项目进度。目前开发已经完成80%，测试环境已经搭建好了。
spk 1: 好的，我这边UI设计已经完成，可以开始集成了。
spk 0: 那我们下周一开始集成测试，大家准备一下。
```

**期望输出**：
```
会议摘要：

主题：项目进度讨论

主要内容：
1. 项目开发进度已完成80%
2. 测试环境已搭建完成
3. UI设计已完成，可以开始集成
4. 计划下周一开始集成测试

行动项：
- 团队成员准备集成测试
```

---

## 6. 调试方法

### 查看前端发送的请求
在浏览器开发者工具中查看 Network 标签：
1. 找到 `/api/ai.generate` 请求
2. 查看 Request Payload：
   ```json
   {
     "prompt": "CRITICAL RULES:...",
     "context": "spk 0: 怎么回事？"
   }
   ```

### 查看后端日志
在服务器日志中搜索：
```
AI Generate LLM request
```

会看到类似：
```json
{
  "model": "qwen3-30b-a3b-instruct",
  "endpoint": "http://localhost:11434/chat/completions",
  "requestLength": 1234,
  "messageCount": 3,
  "promptLength": 456,
  "contextLength": 20
}
```

### 查看 LLM 响应
在服务器日志中搜索：
```
AI Generate LLM response
```

会看到类似：
```json
{
  "model": "qwen3-30b-a3b-instruct",
  "responseLength": 89,
  "mode": "fast"
}
```
