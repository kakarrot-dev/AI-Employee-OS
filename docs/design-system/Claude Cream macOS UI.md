# Claude Cream macOS UI

> 页面级事实源：当前主界面结构、通讯录、连续工作区、Settings、Light/Dark Mode 和视觉验收以 [AI Employee macOS Main Interface Spec v2.0](./AI%20Employee%20macOS%20Main%20Interface%20Spec%20v2.0.md) 为准。[AI Employee macOS Office and Employee Chat UI Spec v1.0](./AI%20Employee%20macOS%20Office%20and%20Employee%20Chat%20UI%20Spec%20v1.0.md) 保留为历史基线。本文件继续维护 Claude Cream Token、业务状态颜色和通用 macOS 组件原则。

## 定位

AI Employee macOS Client 使用 Claude Cream 作为唯一自定义视觉 Token。SwiftUI 继续保留原生 Sidebar、Toolbar、Sheet、Alert、菜单和辅助功能行为，不以自绘控件替代系统交互。

## Token

| 语义 | Light | Dark |
| --- | --- | --- |
| Canvas | `#f5f5f2` | `#2d2e2d` |
| Primary | `#b7791f` | `#e6bf7a` |
| Ink | `#29271d` | `#e9e6dc` |
| Body | `#403d36` | `#ddd9cd` |
| Muted | `#6d675b` | `#bbb6a8` |
| Hairline | `#d8d8d3` | `#3d3d3a` |
| Surface Soft | `#efefeb` | `#2a2b2a` |
| Surface Card | `#fcfcf9` | `#303030` |
| Accent Teal | `#2c6f75` | `#75b5bc` |
| Success | `#4b6f3d` | `#9ab889` |
| Warning | `#8a5e16` | `#e6bf7a` |
| Error | `#7c1b13` | `#ea928a` |

间距只使用 `4 / 8 / 12 / 16 / 24 / 32 / 48`。连续内容表面使用 `12`，唯一主锚点允许使用 `16`；普通按钮、输入和窗口控件服从 macOS 系统样式。中文使用系统字体，正文基准为 16pt。Claude Cream 的暖色只用于品牌、焦点和关键状态，Canvas 使用低彩度中性底，避免整窗泛黄。

## 通用页面规则

- 目标 App Shell 使用原生两栏结构，以 `办公室 / 通讯录 / 工作库 / 技能库 / 工具库` 为主入口，设置固定在 Sidebar 底部并在主 Workspace 内打开。
- 默认窗口为 `1280 × 820pt`，最小窗口为 `720 × 520pt`；紧凑宽度折叠全局 Sidebar，页面级 Inspector 默认收起。
- Task Workspace 的扫描顺序固定为：目标、状态、执行进度、交付结果、Artifact、运行诊断。
- Artifact 是完成页的视觉主锚点；原始 Event 和 Task ID 默认折叠。
- Sidebar Row 保持一个状态图标、一行任务标题和一行中文状态，不承载完整证据。
- Primary 只用于主要交互、焦点和关键图标；正文强调不得滥用 Primary。
- 禁止在 Feature View 中直接使用 `.blue`、`.green`、`.orange`、`.red` 表达业务语义，必须使用 `AppTheme`。
- Light 与 Dark Token 保持同名语义角色。应用跟随系统外观，所有主界面都必须验证 Light/Dark Mode，不使用固定 `.light` Palette 或硬编码白色背景。
- Sidebar 使用 Claude Cream Primary 的低对比选中底色，避免系统蓝与暖色工作区冲突；同一时刻只显示一个选中上下文。

## Release 3 历史基线

Release 3 只实现单 Alex Golden Path。外部 v0.1 设计材料中的 Nova、Agent-Reach、Mock-first、Multi-Agent 和 Xcode Workspace 拆包未进入该版本。当前仓库的 Unified Data Model、Contract、Runtime API 和 MVP 边界继续优先；新的 Office 与 Employee Chat 页面也不能用 Mock 冒充尚不存在的多员工、Conversation 或流式模型能力。

## Release 3 已实现体验方向

**视觉命题**：温暖、克制、高密度的 macOS 原生工作台。Claude Cream 只承担品牌识别、焦点和关键状态，不用大面积卡片或装饰制造“AI 感”。

**内容顺序**：用户进入公司页后，先辨认 Alex 当前状态，再查看当前任务和行动进度，然后看到最新交付物，最后回顾历史工作。单员工 MVP 不展示组织统计、员工卡片网格或虚构的团队能力。

**交互命题**：系统控件保持原生；工作中的 Action 使用系统 ProgressView 表达；页面切换和状态变化保持快速、安静，并服从 Reduce Motion。Artifact 完成后成为页面视觉主锚点。

## Release 3 已实现页面结构

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

- 默认窗口 `1280 × 820`，最小窗口 `720 × 520`。
- 首屏不依赖统计卡片也能回答：Alex 是否在工作、做什么、做到哪里、最近交付了什么。
- Release 3 历史页面只验收 Light Mode。当前主界面按 v2 规格同时验收 Light/Dark Mode，Dark Mode 必须保持同一信息层级且相邻表面可分辨，不能直接自动反色。
- 业务颜色和 Sidebar 选中态全部来自 `AppTheme`。
- 审批、取消、失败、`blocked`、`result_unknown` 和 Artifact 操作语义不因视觉改版而丢失。

## Premium UI v2 采纳裁决

采纳“上下文工作空间、Command Center、Composer 主锚点、轻量表面层级、80% 实色与 20% Material”的方向。Material 仅用于 Command Palette、菜单和临时浮层；主工作区不使用整页玻璃效果。

不采纳 Nova、Projects、实时 Sources、Research Object、Share、Continue Research 和虚构多员工导航。Sidebar 使用自有内容结构和 Claude Cream 低对比选中底色，但不使用高饱和 Accent 色块或左侧选中线。统一卡片阴影不是默认规则，只有 Task Composer 作为输入主锚点使用轻量 elevation；文档表面主要依靠背景层级而不是装饰性阴影。
