# Meeting Minutes with Audio Transcription - Design Document

## 概述

本设计文档描述了如何在Outline知识管理平台中增加Meeting Minutes功能，支持录音、自动AI转写、以及与现有文档系统的无缝集成。该实现严格遵循插件扩展模式，确保核心代码不受修改。

## 设计原则

1. **非侵入性**：通过插件系统扩展，不修改核心Document模型
2. **领域驱动**：采用DDD模式，清晰分离业务逻辑与技术实现
3. **渐进增强**：现有文档功能不受影响，新功能可选启用
4. **用户体验优先**：录音、转写、编辑的全流程优化
5. **安全与隐私**：音频数据加密存储，符合数据保护要求

## 功能范围

### 核心功能
- 📹 实时音频录制（浏览器MediaRecorder API）
- 🎯 AI语音转写（支持多种STT提供商）
- ✏️ 转写文本实时编辑与校对
- 📄 一键生成结构化会议纪要
- 🔄 与现有文档系统无缝集成

### 扩展功能
- 👥 多人会议记录（speaker recognition）
- 📋 议程模板与结构化输出
- 🎭 情感分析与关键词提取
- 📊 会议分析与洞察仪表板

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                 Frontend Plugin                     │
├─────────────────┬─────────────────┬─────────────────┤
│  Meeting UI     │   Editor Node   │  Control Widget │
│  Components     │  & Extensions   │   (Recording)   │
├─────────────────┴─────────────────┴─────────────────┤
│           Outline Core (不变)                        │
├─────────────────────────────────────────────────────┤
│                 Backend Plugin                      │
├─────────────────┬─────────────────┬─────────────────┤
│   Minutes BC    │ Transcription   │   Storage &     │
│  (Domain Core)  │     BC          │   Integration   │
└─────────────────┴─────────────────┴─────────────────┘
                             │
                  ┌─────────┴─────────┐
                  │  External STT     │
                  │  Providers (ACL)  │
                  └───────────────────┘
```

## 文档结构

- **[01-domain-design.md](./01-domain-design.md)** - 领域建模与DDD设计
- **[02-system-architecture.md](./02-system-architecture.md)** - 系统架构与技术选型
- **[03-plugin-integration.md](./03-plugin-integration.md)** - 插件集成详细设计
- **[04-frontend-ux.md](./04-frontend-ux.md)** - 前端交互与用户体验
- **[05-data-flow.md](./05-data-flow.md)** - 数据流与状态管理
- **[06-security-privacy.md](./06-security-privacy.md)** - 安全与隐私设计
- **[07-implementation-guide.md](./07-implementation-guide.md)** - 实现路线图与交付计划

## 快速开始

```bash
# 1. 启用插件
cp plugins/meeting-minutes/plugin.json.sample plugins/meeting-minutes/plugin.json

# 2. 配置环境变量
echo "MEETING_MINUTES_STT_PROVIDER=whisper" >> .env
echo "MEETING_MINUTES_STORAGE_BUCKET=your-bucket" >> .env

# 3. 安装依赖并运行
yarn install
yarn dev
```

## 贡献指南

- 遵循现有的代码风格与架构模式
- 所有新功能必须通过插件系统实现
- 保持向后兼容性
- 充分的单元测试与集成测试覆盖

---

*本设计遵循[Outline插件架构指南](../../PLUGINS_ARCHITECTURE.md)，确保与现有系统的无缝集成。*