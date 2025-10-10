# Outline 功能扩展设计方案

本目录包含为 Outline 知识库系统设计的功能扩展方案，所有方案都遵循最小化架构影响的原则，充分复用现有基础设施。

## 方案列表

### 1. Contacts & Organization（通讯录与组织管理）

**文件**: `contacts-organization-feature-proposal.md`

**功能概述**:
- 为知识库添加联系人（Contact）和组织（Organization）管理
- 作为辅助索引系统，不占用顶层导航
- 支持在文档中通过 @ 提及联系人和组织
- 可作为会议转录中的说话人（Speaker）角色

**核心特性**:
- 低调集成，保持软件简约性
- 扩展现有 Mention 系统
- 支持组织层级结构
- 与文档自动关联
- 支持 CSV 导入和外部系统集成

**技术亮点**:
- 复用 Mention 机制
- 独立的 Contact 和 Organization 模型
- 通过 DocumentContact 关联表追踪引用
- 全文搜索索引优化

### 2. Meeting Transcription（会议纪要听写转文本）

**文件**: `meeting-transcription-feature-proposal.md`

**功能概述**:
- 在文档编辑器中直接录制或上传音频
- 自动转换为文本并插入到文档
- 支持说话人识别（Speaker Diarization）
- 将识别的说话人映射到 User 或 Contact

**核心特性**:
- 实时录音和文件上传两种方式
- 异步队列处理转录任务
- WebSocket 实时推送进度
- 说话人自动识别与手动映射
- 生成格式化的会议纪要

**技术亮点**:
- 复用 Attachment 模型存储音频
- 插件化转录服务（支持多个提供商）
- Bull 队列异步处理
- ProseMirror 节点扩展
- 与 Contacts 深度集成

## 功能协同

这两个功能设计为协同工作，形成完整的会议管理解决方案：

```
┌─────────────────────────────────────────────────────────┐
│                    会议场景示例                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. 用户录制会议音频                                     │
│  2. 转录服务识别出 3 个说话人                            │
│  3. 用户在映射界面中：                                   │
│     • Speaker 1 → User "张三"（团队成员）               │
│     • Speaker 2 → Contact "李四"（客户）                │
│     • Speaker 3 → Contact "王五"（合作伙伴）            │
│  4. 生成的文档包含：                                     │
│     • 参与者列表（@张三 @李四 @王五）                   │
│     • 按说话人分组的对话内容                             │
│     • 自动关联到联系人和组织                             │
│  5. 后续可以：                                           │
│     • 通过联系人页面查看所有相关会议                     │
│     • 通过组织页面查看该公司的所有会议                   │
│     • 在其他文档中 @ 提及这些联系人                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 架构原则

所有方案都遵循以下设计原则：

### 1. 最小化影响
- 复用现有模型和基础设施
- 不修改核心实体结构
- 通过扩展而非修改实现功能

### 2. 插件化设计
- 功能可独立启用/禁用
- 通过功能开关控制
- 不影响核心功能运行

### 3. 遵循现有模式
- **前端**: React + MobX + Styled Components
- **后端**: Koa + Sequelize + Bull 队列
- **编辑器**: ProseMirror 节点扩展
- **权限**: cancan 策略模式

### 4. 向后兼容
- 新功能对旧版本客户端降级处理
- 数据迁移不破坏现有数据
- API 保持向后兼容

## 实施路线图

### 阶段一：基础功能（MVP）

**Contacts & Organization**:
- [ ] 创建 Contact 和 Organization 模型
- [ ] 实现基础 CRUD API
- [ ] 扩展 Mention 系统支持新类型
- [ ] 在设置页面添加管理界面
- [ ] 集成到全局搜索

**Meeting Transcription**:
- [ ] 创建 Transcription 模型
- [ ] 实现音频上传和存储
- [ ] 集成 OpenAI Whisper API
- [ ] 实现基础转录功能
- [ ] 添加编辑器录音组件

### 阶段二：集成与增强

**联合功能**:
- [ ] 实现 Speaker 映射到 User/Contact
- [ ] 自动关联文档与参与者
- [ ] 在文档侧边栏显示相关联系人
- [ ] 智能建议参与者映射

**增强功能**:
- [ ] 说话人自动识别（Azure Speech）
- [ ] CSV 批量导入联系人
- [ ] 组织层级树展示
- [ ] 转录结果智能分段

### 阶段三：高级特性

**Contacts & Organization**:
- [ ] 外部系统集成（CRM、LDAP）
- [ ] 自定义字段支持
- [ ] 联系人活动时间线
- [ ] 组织关系图谱

**Meeting Transcription**:
- [ ] 实时转录
- [ ] AI 摘要和要点提取
- [ ] 时间戳导航
- [ ] 多语言支持和翻译

## 技术栈

### 新增依赖

**前端**:
- 无新增核心依赖（复用现有技术栈）

**后端**:
```json
{
  "openai": "^4.0.0",              // OpenAI Whisper API
  "microsoft-cognitiveservices-speech-sdk": "^1.30.0",  // Azure Speech（可选）
  "@google-cloud/speech": "^5.0.0"  // Google Cloud Speech（可选）
}
```

### 环境变量

```bash
# Contacts & Organization
CONTACTS_ENABLED=true

# Meeting Transcription
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_PROVIDER=whisper  # whisper | azure | google
TRANSCRIPTION_SPEAKER_DIARIZATION=true
OPENAI_API_KEY=sk-xxx
AZURE_SPEECH_KEY=xxx
AZURE_SPEECH_REGION=eastus
```

## 数据库变更

### 新增表

1. `contacts` - 联系人
2. `organizations` - 组织
3. `document_contacts` - 文档-联系人关联
4. `transcriptions` - 转录记录

### 索引优化

- 全文搜索索引（contacts, organizations）
- 关联查询索引（document_contacts）
- 状态查询索引（transcriptions.status）

## 性能考虑

### 存储
- 音频文件：复用现有 S3 兼容存储
- 设置过期策略（30天自动清理）
- 转录完成后可选删除原始音频

### 计算
- 异步队列处理，不阻塞主线程
- 队列并发控制（默认 2-5 个并发）
- 超长音频分段处理

### 成本
- OpenAI Whisper: $0.006/分钟
- Azure Speech: $0.0167/分钟
- 建议设置团队月度配额

## 测试策略

### 单元测试
- 模型验证和关联
- API 路由逻辑
- 权限策略

### 集成测试
- 端到端 API 测试
- 队列处理测试
- WebSocket 事件测试

### 端到端测试
- 录音和上传流程
- Speaker 映射流程
- 文档关联验证

## 文档

每个功能方案都包含：
- 详细的技术设计
- 数据模型定义
- API 接口规范
- UI/UX 设计指南
- 测试策略
- 部署指南

## 贡献

这些设计方案旨在为 Outline 提供参考实现。在实际开发中：

1. 遵循 Outline 的代码规范和风格
2. 保持与主分支的兼容性
3. 编写完整的测试用例
4. 更新相关文档

## 许可

这些设计方案遵循 Outline 项目的许可协议。
