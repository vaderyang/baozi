# 转写功能生产环境修复

## 问题描述

在生产环境中，音频转写功能失败，错误信息为：
```
RangeError: Too many properties to enumerate
at Logger.sanitize (/opt/outline/build/server/logging/Logger.js:51:24)
```

## 根本原因

问题出现在 `server/utils/fetch.ts` 的日志记录中。当发送包含 FormData 的请求时，`Logger.silly()` 尝试记录整个 `init` 对象。FormData 对象包含大量内部属性（可能数千个），导致 `Logger.sanitize()` 方法在尝试枚举这些属性时抛出 `RangeError`。

在开发环境中，`Logger.sanitize()` 会短路返回原始输入（不进行清理），所以不会触发此错误。但在生产环境中，它会尝试遍历所有属性来过滤敏感信息，从而触发错误。

## 修复方案

修改 `server/utils/fetch.ts` 中的日志记录逻辑：

1. **请求日志**：不直接记录 `init` 对象，而是只记录关键信息（method, headers）和 body 的类型名称
2. **响应日志**：移除 `response.headers.raw()` 的记录，只保留基本的状态信息

## 修改的文件

- `server/utils/fetch.ts`

## 测试建议

1. 重新构建应用：`yarn build`
2. 在生产环境中测试音频转写功能
3. 检查日志确认不再出现 "Too many properties to enumerate" 错误
4. 验证转写结果正确插入到文档中

## 相关日志级别

此修复影响 `silly` 级别的日志。如果生产环境的 `LOG_LEVEL` 设置为 `silly`，现在会看到更简洁的请求日志，避免了枚举大量属性的问题。
