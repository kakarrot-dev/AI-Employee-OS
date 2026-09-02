# macOS 客户端排版契约

本契约是客户端文字层级的唯一事实源。页面和组件不得直接写字号、字重、行高或字距数值，只能使用 `src/typography.css` 中的语义 Token。

## 1. 基础刻度

| 层级 | Token | 大小 | 使用边界 |
| --- | --- | ---: | --- |
| Badge | `--type-size-badge` | 9px | 未读数字等非句子信息 |
| Meta | `--type-size-meta` | 11px | 时间、版本、数量等元数据 |
| Secondary | `--type-size-secondary` | 12px | 描述、状态、帮助文字、按钮 |
| Body | `--type-size-body` | 13px | 正文、列表标题、输入内容、导航 |
| Heading | `--type-size-heading` | 15px | 工作区标题、卡片标题、确认弹窗标题 |
| Title | `--type-size-title` | 20px | 页面、详情页和设置页主标题 |
| Metric | `--type-size-metric` | 23px | 金额和关键统计值，不用于普通标题 |

持续显示的中文句子不得使用 Badge 或 Meta。Meta 只承载可快速略读的元数据。

## 2. 布局映射

| 布局位置 | 语义 Token |
| --- | --- |
| 列表栏标题 | `--type-pane-title-size` |
| 内容栏标题 | `--type-workspace-title-size` |
| 详情页主标题 | `--type-page-title-size` |
| 页面分区标题 | `--type-section-title-size` |
| 设置弹窗页标题 | `--type-modal-title-size` |
| 确认弹窗标题 | `--type-dialog-title-size` |

## 3. 组件映射

| 组件文字 | 语义 Token |
| --- | --- |
| 导航项 | `--type-navigation-size` |
| 列表主标题 | `--type-list-title-size` |
| 列表摘要 | `--type-list-summary-size` |
| 正文 | `--type-body-size` |
| 次级说明和帮助文字 | `--type-secondary-size` |
| 按钮、Chip、筛选器 | `--type-control-size` |
| 输入框内容 | `--type-input-size` |
| 表单标签 | `--type-label-size` |
| 状态文字 | `--type-status-size` |
| 时间、版本、数量 | `--type-meta-size` |
| 卡片标题与正文 | `--type-card-title-size` / `--type-card-body-size` |
| Markdown H1 | `--type-markdown-h1-size` |
| Markdown H2 / H3 | `--type-markdown-h2-size` / `--type-markdown-h3-size` |
| Markdown H4 | `--type-markdown-h4-size` |
| Markdown 代码 | `--type-markdown-code-size` |

## 4. 使用规则

1. 新增页面先判断语义角色，再选择 Token，不得根据视觉感觉新增 `12.5px`、`13.5px` 等临时字号。
2. 同一组件在消息、通讯录、能力、系统和弹窗中使用同一个组件 Token。
3. 层级通过字号、字重和颜色共同表达，不通过无限增加字号档位表达。
4. 中文正文使用 `--type-leading-body`，长段阅读内容使用 `--type-leading-reading`，控件使用 `--type-leading-control` 或 `--type-leading-compact`。
5. 新增排版 Token 必须先更新本契约，并说明现有语义角色为何无法覆盖。
6. Markdown 标题与代码使用独立组件 Token，但只映射现有 Title、Heading、Body 和 Secondary 基础刻度，不新增临时字号。

运行 `npm run prototype:check:typography` 检查是否出现绕过契约的原始排版数值。
