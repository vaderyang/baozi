# AI Search Testing Guide

## 测试前准备

### 1. 确认环境变量配置

检查你的 `.env` 文件或环境变量：

```bash
# 查看当前配置
echo $OPENAI_API_KEY
echo $OPENAI_API_BASE_URL
echo $OPENAI_MODEL_NAME

# 或者
echo $LLM_API_KEY
echo $LLM_API_BASE_URL
echo $LLM_MODEL_NAME
```

### 2. 重启服务

```bash
# 停止当前服务
# Ctrl+C

# 重新启动
yarn dev
```

### 3. 检查服务状态

打开浏览器控制台，确认没有错误信息。

## 测试步骤

### 测试 1: 基本功能测试

1. **创建测试文档**
   - 创建一个新文档，标题："测试文档 - AI 搜索"
   - 内容：
     ```markdown
     # AI 搜索功能说明
     
     这是一个测试文档，用于验证 AI 搜索功能。
     
     ## 主要功能
     - 智能搜索文档
     - AI 生成答案
     - 文档引用
     
     ## 使用方法
     1. 输入搜索查询
     2. 启用 AI 答案
     3. 查看生成的答案
     ```

2. **执行搜索**
   - 点击搜索图标或按 `/` 键
   - 输入查询："AI 搜索有什么功能？"
   - 等待搜索结果加载

3. **启用 AI 答案**
   - 在搜索结果上方找到 "AI Answer" 开关
   - 点击开关启用
   - 观察加载状态

4. **验证结果**
   - ✅ 应该显示 AI 生成的答案
   - ✅ 答案应该是 Markdown 格式
   - ✅ 应该包含文档引用
   - ✅ 点击引用应该能跳转到文档

### 测试 2: 空参数测试（修复验证）

1. **不选择任何过滤器**
   - 直接输入查询："测试"
   - 不选择 Collection
   - 不选择 User
   - 不选择 Date Filter

2. **启用 AI 答案**
   - 点击 "AI Answer" 开关
   - **预期结果**: 应该正常工作，不应该出现 "Invalid uuid" 错误

3. **检查浏览器控制台**
   - 打开开发者工具 (F12)
   - 查看 Network 标签
   - 找到 `ai.search` 请求
   - **预期**: 状态码应该是 200，不是 400

### 测试 3: 带过滤器测试

1. **选择 Collection**
   - 选择一个文档集
   - 输入查询
   - 启用 AI 答案
   - **预期**: 只搜索该文档集中的文档

2. **选择日期过滤**
   - 选择 "Last month"
   - 输入查询
   - 启用 AI 答案
   - **预期**: 只搜索最近一个月的文档

3. **组合过滤器**
   - 同时选择 Collection 和 Date Filter
   - 输入查询
   - 启用 AI 答案
   - **预期**: 应用所有过滤器

### 测试 4: 错误处理测试

1. **无搜索结果**
   - 输入一个不存在的查询："xyzabc123notfound"
   - 启用 AI 答案
   - **预期**: 显示友好的错误消息

2. **网络错误模拟**
   - 在开发者工具中设置 "Offline"
   - 尝试启用 AI 答案
   - **预期**: 显示网络错误消息

3. **无效 API 配置**
   - 临时修改环境变量为无效值
   - 重启服务
   - 尝试使用 AI 搜索
   - **预期**: 显示配置错误消息

### 测试 5: 性能测试

1. **长文档测试**
   - 创建一个包含大量内容的文档（>5000字）
   - 搜索该文档
   - 启用 AI 答案
   - **观察**: 响应时间

2. **多文档测试**
   - 创建多个相关文档（5-10个）
   - 使用通用查询
   - 启用 AI 答案
   - **观察**: 响应时间和答案质量

3. **并发测试**
   - 打开多个浏览器标签
   - 同时执行 AI 搜索
   - **观察**: 系统稳定性

## 常见问题排查

### 问题 1: "Invalid uuid" 错误

**症状**: 启用 AI 答案时出现 400 错误，消息显示 "collectionId: Invalid uuid"

**原因**: 空字符串被传递给 UUID 验证器

**解决方案**: 
- ✅ 已在最新提交中修复
- 确保使用最新代码：`git pull origin feature/ai-search-integration`

**验证**:
```bash
# 检查当前提交
git log --oneline -1

# 应该看到: "fix: handle empty string parameters in AI search"
```

### 问题 2: AI 答案不显示

**可能原因**:
1. LLM API 配置错误
2. 网络连接问题
3. 没有搜索结果

**排查步骤**:
```bash
# 1. 检查环境变量
env | grep -E "(LLM|OPENAI|AI)_"

# 2. 检查服务器日志
# 查看终端输出，寻找错误信息

# 3. 检查浏览器控制台
# F12 -> Console 标签
# 查看是否有 JavaScript 错误
```

### 问题 3: 响应太慢

**优化建议**:
1. 使用更快的模型（如 gpt-3.5-turbo）
2. 减少文档数量
3. 使用本地 LLM

**配置示例**:
```bash
# 使用 GPT-3.5 (更快)
OPENAI_MODEL_NAME=gpt-3.5-turbo

# 或使用本地 Ollama
LLM_API_BASE_URL=http://localhost:11434/v1
LLM_MODEL_NAME=llama2
```

### 问题 4: 答案质量不好

**改进方法**:
1. 使用更强大的模型（如 gpt-4）
2. 确保文档内容充足
3. 使用更具体的查询

**示例**:
```bash
# 使用 GPT-4 (更好的质量)
OPENAI_MODEL_NAME=gpt-4

# 或 GPT-4 Turbo
OPENAI_MODEL_NAME=gpt-4-turbo-preview
```

## API 测试

### 使用 cURL 测试

```bash
# 获取认证 token
TOKEN="your-auth-token"

# 测试 AI 搜索 API
curl -X POST http://localhost:3000/api/ai.search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "测试查询",
    "maxDocuments": 5
  }' | jq .

# 带过滤器的测试
curl -X POST http://localhost:3000/api/ai.search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "测试查询",
    "collectionId": "your-collection-id",
    "maxDocuments": 3
  }' | jq .
```

### 使用浏览器控制台测试

```javascript
// 在浏览器控制台中执行

// 测试基本搜索
fetch('/api/ai.search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: '测试查询',
    maxDocuments: 5
  })
})
.then(r => r.json())
.then(data => console.log(data));

// 测试空参数（验证修复）
fetch('/api/ai.search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: '测试查询',
    collectionId: '',  // 空字符串应该被正确处理
    userId: '',
    dateFilter: '',
    maxDocuments: 5
  })
})
.then(r => r.json())
.then(data => console.log(data));
```

## 性能基准

### 预期响应时间

| 场景 | 预期时间 | 说明 |
|------|---------|------|
| 1个文档 + GPT-3.5 | 2-5秒 | 最快配置 |
| 5个文档 + GPT-3.5 | 5-10秒 | 标准配置 |
| 5个文档 + GPT-4 | 10-20秒 | 高质量配置 |
| 本地 LLM | 5-30秒 | 取决于硬件 |

### Token 使用估算

| 场景 | 输入 Tokens | 输出 Tokens | 总计 |
|------|------------|------------|------|
| 简单查询 | ~1000 | ~300 | ~1300 |
| 中等查询 | ~3000 | ~500 | ~3500 |
| 复杂查询 | ~5000 | ~800 | ~5800 |

## 测试清单

### 功能测试
- [ ] 基本搜索和 AI 答案生成
- [ ] 空参数处理（无过滤器）
- [ ] Collection 过滤
- [ ] User 过滤
- [ ] Date 过滤
- [ ] Status 过滤
- [ ] 组合过滤器
- [ ] 文档引用链接
- [ ] 关闭 AI 答案

### 错误处理
- [ ] 无搜索结果
- [ ] 网络错误
- [ ] API 配置错误
- [ ] 超时处理
- [ ] 无效参数

### 用户体验
- [ ] 加载状态显示
- [ ] 错误消息友好
- [ ] 响应式设计
- [ ] 可访问性
- [ ] 性能可接受

### 安全性
- [ ] 需要认证
- [ ] 权限检查
- [ ] 参数验证
- [ ] XSS 防护

## 报告问题

如果发现问题，请提供以下信息：

1. **环境信息**
   - Node.js 版本
   - 浏览器版本
   - 操作系统

2. **配置信息**
   - LLM 提供商
   - 模型名称
   - API 端点

3. **错误信息**
   - 浏览器控制台错误
   - 服务器日志
   - 网络请求详情

4. **重现步骤**
   - 详细的操作步骤
   - 预期结果
   - 实际结果

5. **截图或录屏**
   - 错误界面
   - 网络请求
   - 控制台输出

## 成功标准

测试通过的标准：

✅ 所有功能测试通过
✅ 错误处理正确
✅ 性能在可接受范围内
✅ 用户体验良好
✅ 安全检查通过
✅ 无控制台错误
✅ 无内存泄漏

## 下一步

测试通过后：
1. 合并到主分支
2. 部署到测试环境
3. 收集用户反馈
4. 计划下一阶段功能
