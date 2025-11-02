# AI Search Quick Start Guide

## 快速开始指南

### 1. 配置环境变量

在你的 `.env` 文件中添加以下配置：

```bash
# 使用 OpenAI
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_NAME=gpt-4

# 或者使用其他兼容的 LLM 服务
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://your-llm-provider.com/v1
LLM_MODEL_NAME=your-model-name
```

### 2. 重启服务

```bash
yarn dev
```

### 3. 使用 AI 搜索

1. 打开 Outline 应用
2. 点击搜索图标或按 `/` 键
3. 输入你的搜索查询，例如："如何配置认证？"
4. 在搜索结果上方，你会看到一个 "AI Answer" 开关
5. 点击开关启用 AI 答案
6. 等待几秒钟，AI 会生成一个包含引用的完整答案

### 4. 示例查询

试试这些查询来测试功能：

- "这个项目的主要功能是什么？"
- "如何部署这个应用？"
- "有哪些配置选项？"
- "如何备份数据？"
- "支持哪些认证方式？"

## 功能特点

### ✅ 已实现

- ✅ 基于文档内容的 AI 答案生成
- ✅ 文档来源引用
- ✅ Markdown 格式化答案
- ✅ 支持所有搜索过滤器
- ✅ 加载状态和错误处理
- ✅ 可切换开关

### 🚧 计划中

- 🚧 流式响应（实时生成）
- 🚧 向量搜索（语义搜索）
- 🚧 对话历史（多轮对话）
- 🚧 答案缓存
- 🚧 答案反馈（点赞/点踩）

## 架构说明

```
┌─────────────────┐
│   用户输入查询   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  搜索相关文档    │ (documents.search)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  获取文档内容    │ (最多5个文档)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  构建提示词      │ (包含文档内容)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  调用 LLM API   │ (OpenAI/其他)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  解析并格式化    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  显示答案+来源   │
└─────────────────┘
```

## API 使用示例

### cURL

```bash
curl -X POST http://localhost:3000/api/ai.search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何配置认证？",
    "maxDocuments": 5
  }'
```

### JavaScript

```javascript
const response = await fetch('/api/ai.search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: '如何配置认证？',
    collectionId: 'optional-collection-id',
    maxDocuments: 5
  })
});

const data = await response.json();
console.log(data.data.answer);
console.log(data.data.sources);
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:3000/api/ai.search',
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    },
    json={
        'query': '如何配置认证？',
        'maxDocuments': 5
    }
)

data = response.json()
print(data['data']['answer'])
print(data['data']['sources'])
```

## 常见问题

### Q: AI 答案不显示？

**A:** 检查以下几点：
1. 确认环境变量已正确配置
2. 检查 LLM API 密钥是否有效
3. 查看浏览器控制台和服务器日志
4. 确保搜索返回了结果

### Q: 答案质量不好？

**A:** 尝试：
1. 使用更具体的查询
2. 确保相关文档存在且内容充足
3. 使用更强大的模型（如 GPT-4）
4. 检查文档内容是否相关

### Q: 响应太慢？

**A:** 可以：
1. 减少 `maxDocuments` 参数
2. 使用更快的模型
3. 考虑实现缓存
4. 检查网络延迟

### Q: 成本太高？

**A:** 建议：
1. 使用较小的模型（如 GPT-3.5）
2. 实现答案缓存
3. 限制每个用户的查询频率
4. 考虑使用本地模型

## 本地 LLM 配置示例

### 使用 Ollama

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama2

# 配置环境变量
LLM_API_BASE_URL=http://localhost:11434/v1
LLM_MODEL_NAME=llama2
LLM_API_KEY=ollama
```

### 使用 LM Studio

```bash
# 启动 LM Studio 并加载模型
# 启用本地服务器（默认端口 1234）

# 配置环境变量
LLM_API_BASE_URL=http://localhost:1234/v1
LLM_MODEL_NAME=your-model-name
LLM_API_KEY=lm-studio
```

## 性能优化建议

1. **文档优化**
   - 保持文档结构清晰
   - 使用有意义的标题
   - 避免过长的文档

2. **查询优化**
   - 使用具体的关键词
   - 避免过于宽泛的查询
   - 利用过滤器缩小范围

3. **系统优化**
   - 考虑实现 Redis 缓存
   - 使用 CDN 加速
   - 监控 API 使用情况

## 下一步

- 查看 [完整文档](./AI_SEARCH.md)
- 探索 [API 参考](../server/routes/api/ai/schema.ts)
- 贡献改进建议

## 反馈

如果你有任何问题或建议，请：
- 提交 GitHub Issue
- 加入社区讨论
- 查看服务器日志获取详细错误信息
