# UI反馈测试

<cite>
**本文档中引用的文件**  
- [developer.tsx](file://app/actions/definitions/developer.tsx)
- [NotificationsStore.ts](file://app/stores/NotificationsStore.ts)
- [Notification.ts](file://server/models/Notification.ts)
- [Toasts.tsx](file://app/components/Toasts.tsx)
</cite>

## 目录
1. [简介](#简介)
2. [前端通知触发机制](#前端通知触发机制)
3. [后端通知模拟流程](#后端通知模拟流程)
4. [测试用例与使用场景](#测试用例与使用场景)
5. [架构关系图](#架构关系图)

## 简介
本文档详细阐述了UI反馈测试功能中“创建通知消息”工具的实现细节。重点分析了如何通过开发者菜单触发前端Toasts和系统通知的展示，以及相关组件之间的交互逻辑。文档涵盖了从用户界面操作到后端API处理的完整流程，并提供了在测试通知样式、交互行为和多语言显示方面的实际应用案例。

## 前端通知触发机制

该功能通过开发者菜单中的特定动作来触发前端通知的展示。核心实现在`app/actions/definitions/developer.tsx`文件中定义的`createToast`动作。

当用户在开发环境中访问开发者菜单并选择“Create toast”选项时，系统会调用`toast.message`方法展示一个持续30秒的前端通知（Toast）。此通知使用`sonner`库实现，内容为“Hello world”。该机制允许开发者快速验证通知组件的视觉样式和交互行为。

通知的展示由`app/components/Toasts.tsx`中的`Toaster`组件管理，该组件配置了主题颜色、边框样式和字体属性，确保通知在不同主题下具有一致的视觉表现。

**Section sources**
- [developer.tsx](file://app/actions/definitions/developer.tsx#L153-L162)
- [Toasts.tsx](file://app/components/Toasts.tsx#L1-L42)

## 后端通知模拟流程

后端通过`/developer.create_test_users` API端点模拟通知创建流程。当`createTestUsers`动作被触发时，前端会向该端点发送POST请求，创建10个测试用户。

通知的创建和管理由`Notification`模型和相关处理器负责。`Notification`模型定义了通知的核心属性，包括：
- `id`: 通知的唯一标识符
- `viewedAt`: 通知被查看的时间戳
- `archivedAt`: 通知被归档的时间戳
- `createdAt`: 通知创建时间
- `data`: 与通知相关的附加数据
- `event`: 通知事件类型

当通知被创建时，`@AfterCreate`钩子会触发`Event.schedule`方法，将通知事件加入调度队列。系统还提供了`pixelToken`和`pixelUrl`方法，允许在无需登录的情况下标记通知为已读。

通知的查询和更新通过`NotificationsStore`进行管理，该store提供了`fetchPage`、`markAllAsRead`和`markAllAsArchived`等方法来处理通知的生命周期。

**Section sources**
- [developer.tsx](file://app/actions/definitions/developer.tsx#L138-L151)
- [NotificationsStore.ts](file://app/stores/NotificationsStore.ts#L10-L96)
- [Notification.ts](file://server/models/Notification.ts#L37-L288)

## 测试用例与使用场景

### 通知样式测试
通过触发`createToast`动作，可以快速验证前端通知的视觉样式，包括：
- 颜色主题适配（明暗模式）
- 字体大小和行高
- 边框和背景色
- 关闭按钮的交互状态

### 交互行为测试
该功能可用于测试以下交互行为：
- 通知的自动消失时间（30秒）
- 手动关闭通知的交互
- 通知在不同屏幕尺寸下的响应式布局
- 多个通知的堆叠显示效果

### 多语言显示测试
虽然`createToast`动作目前使用硬编码的“Hello world”文本，但整个通知系统支持国际化。`Notification`模型中的`eventText`方法使用翻译函数`t`来返回本地化的事件描述文本，支持多种语言环境下的通知内容显示。

### 开发者工具集成
该功能作为开发者工具的一部分，仅在开发环境（`env.ENVIRONMENT === "development"`）中可见。它与其他开发者工具（如清除缓存、创建测试用户等）共同构成了完整的UI反馈测试套件。

**Section sources**
- [developer.tsx](file://app/actions/definitions/developer.tsx#L138-L162)
- [Toasts.tsx](file://app/components/Toasts.tsx#L1-L42)
- [Notification.ts](file://server/models/Notification.ts#L200-L210)

## 架构关系图

```mermaid
graph TD
A[开发者菜单] --> B[createToast动作]
B --> C[sonner toast.message]
C --> D[Toasts组件]
D --> E[前端通知展示]
F[createTestUsers动作] --> G[API客户端]
G --> H[/developer.create_test_users]
H --> I[Notification模型]
I --> J[Event调度]
J --> K[通知处理器]
K --> L[数据库持久化]
M[NotificationsStore] --> N[fetchPage]
M --> O[markAllAsRead]
M --> P[markAllAsArchived]
N --> I
O --> I
P --> I
```

**Diagram sources**
- [developer.tsx](file://app/actions/definitions/developer.tsx#L138-L162)
- [NotificationsStore.ts](file://app/stores/NotificationsStore.ts#L10-L96)
- [Notification.ts](file://server/models/Notification.ts#L37-L288)
- [Toasts.tsx](file://app/components/Toasts.tsx#L1-L42)