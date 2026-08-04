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
