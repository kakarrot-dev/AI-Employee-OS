# AI Employee macOS UI Token & Component Contract v1.0

> 可交互样式预览：[AI Employee macOS Component Library Preview](./AI%20Employee%20macOS%20Component%20Library%20Preview.html)

## 1. 目的与边界

本文定义 AI Employee OS macOS 客户端的 UI Token 分层、通用组件契约、动效语义、可访问性和复用门禁。目标不是建立一套脱离业务的展示组件，而是让相同输入、状态、行为和错误契约只实现一次。

事实源优先级：

1. Runtime、Task、Action、Approval、Artifact、Employee、Conversation、Skill、Tool 契约决定业务事实。
2. 《AI Employee macOS Main Interface Spec v2.0》决定信息架构与页面布局。
3. 《AI Employee macOS UX State & Interaction Standard v1.0》决定状态、恢复、动效和可访问性。
4. 《Claude Cream macOS UI》与 `AppTheme` 决定视觉 Token。
5. 本文决定组件级 Token、复用边界和组件 API。

本文不允许组件持久化第二套业务状态，也不允许为了视觉统一把不同业务行为强行合并。

## 2. 设计判断

**Design Read**：面向长期日常工作的原生 macOS AI 员工工作台，使用 Claude Cream 暖中性色、高密度信息、连续页面和克制的精密动效，属于保留式重设计。

Taste 参数：

| 参数 | 值 | 约束 |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 4 | 保持原生 App Shell 和稳定扫描顺序，不追求营销页式不对称 |
| `MOTION_INTENSITY` | 4 | 有明确反馈与状态过渡，不使用滚动特效或装饰循环 |
| `VISUAL_DENSITY` | 7 | 支持高频工作与信息扫描，减少卡片和无效留白 |

**视觉命题**：温暖、克制、高密度的 macOS 原生连续工作台。Claude Cream 只承担品牌、焦点、Selection 和关键状态。

**内容命题**：每个表面先帮助用户定位，再展示状态，最后提供一个明确操作。办公室、列表、详情和 Inspector 不使用营销页 Hero。

**交互命题**：只保留 Press、Hover Reveal、Selection Morph、Panel Transition 和真实结果更新。键盘高频导航不播放动画。

## 3. Token 分层

```text
Foundation
Palette / Spacing / Typography / Radius / Duration
        ↓
Semantic
Text / Surface / Selection / Focus / Status / Motion Intent
        ↓
Native Primitive
ButtonStyle / IconButton / SearchField / Tab / Badge / Feedback
        ↓
Business Pattern
Timeline / Composer / Approval / Artifact / Task Status / Inspector
```

规则：

- Foundation 只描述可复用的视觉尺度。
- Semantic Token 描述用途，不只描述数值。
- Native Primitive 必须建立在 SwiftUI 系统控件之上。
- Business Pattern 可以共享，但不得进入无业务语义的基础组件层。
- 只有至少两个调用方具有相同输入、状态、行为、错误和可访问性契约时，组件才进入 DesignSystem。
- 只有视觉相似但业务状态不同的视图继续留在 Feature 内。

## 4. 颜色与表面

### 4.1 基础 Palette

| 角色 | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `canvas` | `#F5F5F2` | `#2D2E2D` | 主工作区 |
| `surfaceSoft` | `#EFEFEB` | `#2A2B2A` | Sidebar、弱分区 |
| `surfaceCard` | `#FCFCF9` | `#303030` | Artifact、输入、需要独立边界的表面 |
| `ink` | `#29271D` | `#E9E6DC` | 主标题与高强调文字 |
| `body` | `#403D36` | `#DDD9CD` | 正文与主要控件文字 |
| `muted` | `#6D675B` | `#BBB6A8` | 次要文字 |
| `mutedSoft` | `#756F63` | `#9A958A` | 低强调文字、图标与禁用状态，普通文字仍满足 AA |
| `primary` | `#B7791F` | `#E6BF7A` | 品牌、焦点、Selection 和关键状态 |
| `primaryActive` | `#9E6719` | `#F0CF92` | 主操作和选中前景 |
| `accentTeal` | `#2C6F75` | `#75B5BC` | 中性信息和辅助数据系列 |
| `success` | `#4B6F3D` | `#9AB889` | 成功 |
| `warning` | `#8A5E16` | `#E6BF7A` | 警告和等待处理 |
| `error` | `#7C1B13` | `#EA928A` | 失败和危险 |

### 4.2 语义状态

| Token | 定义 | 用途 |
| --- | --- | --- |
| `selectionFill` | Primary 12% | Sidebar、Tab、Row 选中态 |
| `hoverFill` | Surface Card 72% | 可点击 Row 的 Hover |
| `focusStroke` | Primary 32% | 输入和自定义控件焦点 |
| `dangerFill` | Error 10% | 危险提示的弱背景 |
| `disabledOpacity` | 52% | 无操作能力但仍需可读的控件 |

颜色不是状态的唯一表达。Success、Warning、Error 必须同时出现图标或明确文字。`primary` 不用于普通正文。

## 5. 排印与数字

- Latin 使用 SF Pro，中文使用 PingFang SC 系统回退，不捆绑自定义字体。
- 中文不使用负字距。
- 页面主标题 `22pt`，页面区标题 `16pt`，工作区标题 `14pt`，主导航与侧栏条目 `13pt`。
- 员工回复、用户消息与长文正文统一为 `14pt`，界面正文与输入为 `13pt`，通过行距和表面层级区分消息角色。
- 辅助正文 `12pt`，元信息 `11pt`，仅空间受限的标签使用 `10pt`，代码使用 `12pt`。
- 时间、Token、价格、百分比和动态计数使用 `monospacedDigit()`。
- 消息阅读宽度最大 `820pt`，消息轮次间距 `24pt`。

## 6. 间距、圆角与控件尺度

基础间距只使用 `4 / 8 / 12 / 16 / 24 / 32 / 48`。组件内部如需光学校正，可以使用组件私有数值，但不得成为页面级间距。

| 语义 | 值 |
| --- | ---: |
| 小型视觉控件高度 | `28pt` |
| 标准按钮高度 | `32pt` |
| 搜索与菜单字段高度 | `34pt` |
| 最小交互命中区域 | `40 × 40pt` |
| Control Radius | `8pt` |
| Selection Row Radius | `9pt` |
| Panel Radius | `12pt` |
| Modal Radius | `16pt` |
| Composer Radius | `18pt` |

圆角只用于输入、Selection、Artifact、Modal、Composer 和确实需要独立边界的表面。普通 Section 默认依靠留白、背景层级和 Divider。

## 7. 语义动效

动效 Token 必须描述交互意图，不使用 `fast / standard / emphasized` 作为调用端 API。

| Token | 时长 | 曲线 | 用途 |
| --- | ---: | --- | --- |
| `pressFeedback` | `120ms` | ease out | 按下缩放与透明度反馈 |
| `hoverReveal` | `120ms` | ease out | Hover 操作和 Row 背景 |
| `selectionMorph` | `180ms` | ease in out | Tab 指示器等原地形变 |
| `stateCrossfade` | `180ms` | ease out | 同一区域的数据和状态更新 |
| `panelPresentation` | `220ms` | ease out | Popover、Modal、临时面板进入 |
| `panelDismissal` | `160ms` | ease in | 临时面板退出 |
| `metricReveal` | `900ms` | ease out | 首次真实数字和折线绘制 |
| `activePulse` | `1150ms` | ease in out | 真实运行状态，唯一允许的循环强调 |

约束：

- 高频键盘导航和快捷键触发的 Selection 不播放动画。
- 动画只绑定明确的 `value`，禁止裸 `.animation(_)`。
- 只动画 `opacity`、`scale`、`offset` 或绘制进度，不动画布局尺寸。
- Press 缩放为 `0.98`，Panel 位移不超过 `8pt`。
- Reduce Motion 下取消位移、缩放和循环，但保留静态状态文字或进度信号。
- 页面首次进入不批量错峰播放内容。

## 8. 通用组件契约

### 8.1 Button

`CreamPrimaryButtonStyle` 用于一个表面唯一的主要动作。`CreamSecondaryButtonStyle` 用于取消、返回或次要动作。`CreamIconButton` 用于纯图标次要动作。

必须覆盖 Default、Pressed、Keyboard Focus、Disabled 和 Loading。纯图标按钮必须由组件 API 强制提供 Help 和 Accessibility Label。

Primary 与 Secondary Style 通过 `isLoading` 显式接收进行中状态；Loading 时组件负责替换视觉标签、阻止重复点击并提供可访问性状态值，调用方仍负责以 `.disabled(...)` 暴露真实业务可用性。自定义 Button、Tab 与 Segment 的 Keyboard Focus 必须使用 `focusStroke`，不得仅依赖 Hover 或颜色变化。

### 8.2 Search Field

`CreamSearchField` 统一搜索图标、文本字体、清除入口、字段高度、圆角、背景、描边和可访问名称。业务页面只提供 placeholder、Binding 和提交动作。

搜索为空与结果为空是不同状态。Search Field 不负责过滤业务数据。

### 8.3 Sidebar Row

`creamSidebarRowSurface` 只负责 Default、Hover、Selected 表面。Row 内容仍由业务页面负责，并保持一个图标、一行标题和最多一行次要信息。

### 8.4 Section Header

`CreamSectionHeader` 统一标题、可选说明、计数和尾随操作。它不生成 Card，不创建新的页面层级。

### 8.5 Status Badge

`CreamStatusBadge` 只接收已经派生好的文案、图标和 `UXFeedbackTone`。它不解析 Runtime 字符串，不自行决定 Task 或 Action 状态。

### 8.6 Feedback

继续使用 `UXFeedbackStateView`、`UXInlineFeedback`、`UXAsyncActionLabel` 和 `UXToastOverlay`。Loading、Empty、Failure、Blocked、Result Unknown 必须保留不同表达。

### 8.7 Timeline

员工私聊与 Task Thread 必须复用 `CreamTimelineLayout`、`CreamTimelineUserMessage`、`CreamTimelineAgentRow` 和 `CreamTimelineMarkdownBody`。共享层统一阅读宽度、轮次间距、消息对齐、用户气泡、头像与作者元数据、时间、复制、可选编辑、长消息折叠、Markdown 排印和 Reduce Motion。

Feature 只负责把 `ChatMessage`、`TaskRun` 或 `TaskRoomTimelineItem` 映射为共享组件，并提供编辑、审批、交接、产物等业务动作。审批、Handoff、Deliverable 与 Runtime Activity 可以保留专用内容，但其事件表面不得创建第二套普通消息阅读模式。页面可以调整外边距和用户消息最大宽度，不得重新实现同类气泡、作者行或消息动作。

### 8.8 Composer 与 Modal

`CreamComposer` 是办公室任务入口、员工私聊和 Task Thread 的共享输入组件。组件统一负责多行输入、Focus 表面、Enter 提交、Shift+Enter 换行、32pt 提交/停止按钮、40pt 命中区域、Disabled、Loading、Help、Accessibility Label 和 Reduce Motion；业务草稿、是否可提交、提交/停止动作与邻近错误仍由各自 Store 和 Feature 提供。

键盘输入核使用最小范围的 `NSTextView` 桥接：SwiftUI 仍持有文本与动作状态，AppKit 只负责 Return 事件、光标选区、中文输入法合成和文本高度测量。输入法存在 marked text 时，Return 必须先交给系统完成候选确认，不得误触发提交。

尺寸只通过 `CreamComposerSize` 变化：`compact` 为 34pt 最小输入高度，`regular` 为 38pt，`expanded` 为 46pt。页面可以提供最大宽度，但不得重新实现输入、底部布局或提交按钮。`creamFloatingComposer` 仅作为 `CreamComposer` 的内部表面 Primitive，Feature 页面禁止直接调用。

底部只显示已经接通真实行为的操作。无 Runtime/Store 契约的装饰性加号、附件选择和“工作模式”入口不得进入共享组件。`CreamModalOverlay` 只用于确实需要焦点锁定的高风险或编辑流程，普通详情优先使用 Inspector 或页面内展开。

`CreamModalOverlay` 必须统一 Escape 关闭、Modal Focus Section、全屏 Pointer 遮罩、背景 Accessibility 隔离，以及关闭后的 First Responder 恢复。背景禁用必须推迟到 Bridge 捕获原 First Responder 之后，关闭时先恢复背景可用性，再恢复原控件；不得通过直接绑定 `isModalPresented` 的 `.disabled(...)` 提前清空焦点。SwiftUI 继续拥有显示状态，AppKit Bridge 只保存和恢复 `NSWindow.firstResponder`，不得持有业务状态或建立第二套导航。

### 8.9 Command Palette 专用 Pattern

`CreamCommandPaletteSearchField` 是已标准化的 Specialized Pattern，不是普通 `CreamSearchField` 的待迁移副本。它由 Command Palette 持有 Focus Binding，并将 Return、上下键选择和 Escape 保留给命令路由；共享视觉 Token、清除动作、Help 与 Accessibility Label 仍必须复用 DesignSystem。

执行命令后关闭 Modal。若原 First Responder 仍存在则恢复；导航已经替换原页面时，焦点回退到目标窗口内容，不得落到已隐藏的背景控件。

## 9. 组件状态矩阵

| 组件 | Default | Hover | Pressed | Focus | Selected | Disabled | Loading | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Primary Button | 必须 | 可选 | 必须 | 必须 | 不适用 | 必须 | 必须 | 外部反馈 |
| Secondary Button | 必须 | 可选 | 必须 | 必须 | 不适用 | 必须 | 可选 | 外部反馈 |
| Icon Button | 必须 | 必须 | 必须 | 必须 | 可选 | 必须 | 可选 | 外部反馈 |
| Search Field | 必须 | 不适用 | 不适用 | 必须 | 不适用 | 必须 | 不适用 | 邻近反馈 |
| Sidebar Row | 必须 | 必须 | 必须 | 必须 | 必须 | 必须 | 可选 | 邻近反馈 |
| Status Badge | 必须 | 不适用 | 不适用 | 不适用 | 不适用 | 可选 | 可表达 | 可表达 |
| Timeline Message | 必须 | 必须 | 可选 | 必须 | 不适用 | 可选 | 可表达 | 邻近反馈 |
| Composer | 必须 | 可选 | 必须 | 必须 | 不适用 | 必须 | 必须 | 邻近反馈 |

## 10. Page、Section、Row

- `AdaptivePage`：办公室、归档等单主内容页面。
- `AdaptiveBrowser`：通讯录、知识库、技能库、工具库、设置。
- `AdaptiveWorkspace`：工作库、员工私聊。
- Page 决定阅读宽度和窗口响应。
- Section 使用标题、留白和 Divider 建立层级。
- Row 承担单个可扫描对象，不默认包裹 Card。
- Inspector 只承载补充信息和次级操作。

## 11. Do / Do Not

Do：

- 使用 SF Symbols 和系统控件。
- 使用背景明度差和 Hairline 建立层级。
- 一个表面只保留一个主操作。
- 真实状态变化才使用动效。
- 同时验证 Light、Dark、Reduce Motion、键盘和 VoiceOver。

Do Not：

- 不使用 AI 紫蓝渐变、整页玻璃、Bento、瀑布流或滚动劫持。
- 不给每个 Section 添加圆角阴影 Card。
- 不用装饰性状态点，状态点必须对应真实状态。
- 不用 Hover 代替 Press 或键盘 Focus。
- 不把网页 Skill 的 Tailwind、Motion、GSAP 或字体建议移植进 SwiftUI。
- 不为组件建立新的业务枚举或持久化状态。

## 12. 验收与治理

每个进入 DesignSystem 的组件必须满足：

1. 至少两个真实调用方具有相同契约。
2. API 不含产品名、固定 Mock 数据、Runtime 字符串解析或路由。
3. Light、Dark 和高对比语义可读。
4. Keyboard Focus、Help、Accessibility Label 和 Reduce Motion 完整。
5. 组件改动后检查全部调用方，而不只检查示例。
6. 新动效必须使用语义 Motion Token。
7. 正文、按钮和表单文字对背景达到 WCAG AA `4.5:1`，大型图形与非文字控件达到 `3:1`。
8. 在 `1280 × 820pt` 与 `720 × 520pt` 验证布局，不通过拉伸正文填满宽屏。

静态门禁必须检查 Palette 对比度、旧 Motion Token、硬编码业务颜色、组件存在性和至少两个调用方。运行态验收必须使用打包 App，不以编译成功替代视觉检查。

## 13. Agent Prompt Guide

- “使用 `canvas #F5F5F2 / #2D2E2D`、系统 SF Pro/PingFang、22pt 页面主标题、16pt Section 标题、13pt 界面正文和 24pt Section 间距创建无 Card 的 `AdaptivePage`。”
- “使用 `CreamSearchField`，字段高度 34pt、圆角 8pt、Surface Card 背景、Hairline 描边，并提供清除搜索的 Help 与 Accessibility Label。”
- “使用 `CreamIconButton` 创建 40pt 命中区域的纯图标操作，Press 缩放 0.98、120ms ease out，Reduce Motion 下取消缩放。”
- “使用 `CreamStatusBadge` 展示已经派生好的状态，文字 11pt Semibold，颜色与图标同时表达语义，不在组件内解析 Runtime 状态。”
- “Panel 进入使用 220ms ease out、Opacity 加最多 8pt 位移，退出使用 160ms ease in，键盘高频操作不播放动画。”

## 14. Taste Skill 使用边界

项目内安装的 `design-taste-frontend` Skill 主要面向网页 Landing Page、Portfolio 和 Redesign，并明确不负责 Dashboard、密集产品 UI 和原生应用。本项目只采用其可迁移规则：先审计、避免模板化输出、减少无语义 Card、完整交互状态、动效必须有理由、交付前执行可访问性和一致性检查。

React、Next.js、Tailwind、GSAP、网页 Hero、滚动叙事、字体包和图片生成规则不进入本项目实现。
