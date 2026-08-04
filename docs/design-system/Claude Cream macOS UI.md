# Claude Cream macOS UI

## 定位

AI Employee macOS Client 使用 Claude Cream 作为唯一自定义视觉 Token。SwiftUI 继续保留原生 Sidebar、Toolbar、Sheet、Alert、菜单和辅助功能行为，不以自绘控件替代系统交互。

## Token

| 语义 | Light | Dark |
| --- | --- | --- |
| Canvas | `#f5f3e9` | `#2d2e2d` |
| Primary | `#b7791f` | `#e6bf7a` |
| Ink | `#29271d` | `#e9e6dc` |
| Body | `#403d36` | `#ddd9cd` |
| Muted | `#6d675b` | `#bbb6a8` |
| Hairline | `#d8d2c3` | `#3d3d3a` |
| Surface Soft | `#f8f7f2` | `#2a2b2a` |
| Surface Card | `#ffffff` | `#303030` |
| Accent Teal | `#2c6f75` | `#75b5bc` |
| Success | `#4b6f3d` | `#9ab889` |
| Warning | `#8a5e16` | `#e6bf7a` |
| Error | `#7c1b13` | `#ea928a` |

间距只使用 `4 / 8 / 12 / 16 / 24 / 32 / 48`。内容表面圆角使用 `12`，普通按钮、输入和窗口控件服从 macOS 系统样式。中文使用系统 PingFang SC，正文基准为 16pt。

## 页面规则

- App Shell 固定为 `Company / Alex / Tasks / Artifacts / Knowledge`，Settings 使用独立 macOS Scene，不作为普通内容页。
- Task Workspace 的扫描顺序固定为：目标、状态、执行进度、交付结果、Artifact、运行诊断。
- Artifact 是完成页的视觉主锚点；原始 Event 和 Task ID 默认折叠。
- Sidebar Row 保持一个状态图标、一行任务标题和一行中文状态，不承载完整证据。
- Primary 只用于主要交互、焦点和关键图标；正文强调不得滥用 Primary。
- 禁止在 Feature View 中直接使用 `.blue`、`.green`、`.orange`、`.red` 表达业务语义，必须使用 `AppTheme`。
- Light 与 Dark 使用同名语义 Token，不建立两套页面结构。
- Sidebar 选中背景遵循用户的 macOS 系统强调色，Claude Cream Primary 用于内容操作、焦点和状态锚点，不自绘 List Selection。

## 当前 MVP 裁决

外部 v0.1 设计材料中的 Nova、Agent-Reach、Mock-first、Multi-Agent 和 Xcode Workspace 拆包不进入当前 Alex MVP。当前仓库的 Unified Data Model、Contract、Runtime API 和 MVP 边界优先；设计材料只提供 UI、交互和组件约束。

## v0.1 体验方向

**视觉命题**：温暖、克制、高密度的 macOS 原生工作台。Claude Cream 只承担品牌识别、焦点和关键状态，不用大面积卡片或装饰制造“AI 感”。

**内容顺序**：用户进入公司页后，先辨认 Alex 当前状态，再查看当前任务和行动进度，然后看到最新交付物，最后回顾历史工作。单员工 MVP 不展示组织统计、员工卡片网格或虚构的团队能力。

**交互命题**：系统控件保持原生；工作中的 Action 使用系统 ProgressView 表达；页面切换和状态变化保持快速、安静，并服从 Reduce Motion。Artifact 完成后成为页面视觉主锚点。

## 页面结构

### 公司

公司页是日常工作台，不是数据 Dashboard：

1. Alex 状态行：身份、当前工作状态和唯一主操作。
2. 当前工作：任务目标、Task 状态、Action 时间线和取消入口。
3. 快速委派：输入目标、证据和期望产物，提交后进入既有审批流程。
4. 最新交付：最近一个有 Artifact 的任务，提供前往成果区的入口。
5. 最近工作：最多三条任务记录，进入任务区查看完整详情。

没有任务时显示可执行的引导，不显示 `0 / 0 / 0` 指标或空员工卡片。

### Alex

Alex 页解释职责、能力和运行边界，不重复展示首页工作状态，也不模拟人物档案或数字人。

### 任务

左侧为任务列表，右侧按 `目标 -> 状态 -> 执行进度 -> 交付结果 -> Artifact -> 诊断` 展示。`blocked` 与 `result_unknown` 只来自 Action，不映射为 Task 状态。

### 成果

成果区以可阅读 Markdown 文档为主，不模拟文件管理器。文件路径是次要证据，默认弱化显示。

## UI 状态映射

| 事实状态 | 用户可见表达 | 自动行为 |
| --- | --- | --- |
| Task `pending` | 已排队 | 等待 Runtime |
| Task `running` | Alex 正在工作 | 展示 Action 进度，允许请求取消 |
| Task `succeeded` | 已交付 | 突出 Artifact 与质量门禁 |
| Task `failed` | 未完成 | 展示错误与恢复建议 |
| Task `cancelled` | 已取消 | 不再表现为进行中 |
| Action `blocked` | 等待授权或权限处理 | 不创建 Task `blocked` |
| Action `result_unknown` | 需要人工核验 | 禁止自动重放 |

UI 不持久化 `Available / Planning / Reviewing / Completed / Error` 等第二套状态。Alex 的“可接受任务 / 正在工作 / 最近已交付”必须由 Task 和 Action 事实派生。

## 验收

- 默认窗口 `1280 × 820`，最小窗口 `960 × 640`。
- 首屏不依赖统计卡片也能回答：Alex 是否在工作、做什么、做到哪里、最近交付了什么。
- Light 与 Dark 保持同一信息层级，相邻表面可分辨。
- 业务颜色全部来自 `AppTheme`，系统 Sidebar 选中态继续服从 macOS。
- 审批、取消、失败、`blocked`、`result_unknown` 和 Artifact 操作语义不因视觉改版而丢失。

## Premium UI v2 采纳裁决

采纳“上下文工作空间、Command Center、Composer 主锚点、轻量表面层级、80% 实色与 20% Material”的方向。Material 仅用于 Command Palette、菜单和临时浮层；主工作区不使用整页玻璃效果。

不采纳 Nova、Projects、实时 Sources、Research Object、Share、Continue Research 和多员工导航。Sidebar 继续使用 macOS 原生选中态，不自绘 Accent 色块或左侧选中线。统一卡片阴影不是默认规则，只有 Task Composer 作为输入主锚点使用轻量 elevation；文档表面主要依靠背景层级而不是装饰性阴影。
