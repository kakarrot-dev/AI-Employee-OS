# Open Claude UI 桌面客户端重构验收

日期：2026-10-16。实施范围见[重构契约](2026-10-16-open-claude-ui-client-contract.md)。

## 交付结果

正式 Electron Renderer 已切换至 [Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui/tree/f504349419118a32804ce3a7fae74593070bf945) 的主题、基础组件和桌面设计机制。布局、字体栈、字号、尺寸、间距、圆角、图标、浅深主题、响应式及聊天消息展示均已替换。消息、事项、通讯录、能力、连接、系统保留原有业务数据、状态和回调。

正式入口仅加载 Tailwind、上游主题及新的 CDS 基础、消息、业务和桌面样式；旧 Web 原型样式不进入正式客户端。Web 原型及本轮开始前的未提交工作保留。

| 区域 | 完成的替换 |
| --- | --- |
| 桌面壳 | 45px 顶栏、288px 标准侧栏、阅读宽度约束；窄窗口图标栏与目录覆盖面板 |
| 基础组件 | 上游按钮、分段选择、状态提示；CDS 弹窗、输入控件、列表、详情和表单；Lucide 图标 |
| 字体与间距 | 上游 sans / serif / mono 栈及字阶；六模块统一使用 CDS 尺寸和语义 Token |
| 用户消息 | 14.5px / 1.625、18px 气泡、10×16px 内边距、11px 时间戳；附件位于气泡外上方 |
| AI 回复 | 15px / 1.625、672px 阅读宽度；20px 头像及姓名、真实模型、时间组成同一头部；普通正文完整显示 |
| Markdown | 标题、段落、粗斜体、删除线、多级列表、引用、链接、行内代码、代码块、表格、任务列表、图片和分割线；长内容在局部滚动 |
| 代码块 | 上游 36px 工具栏、12px 圆角、14px 内边距和 13px 等宽正文；复制成功反馈 2.5 秒，失败可重试 |
| 输入与滚动 | 常驻受控输入、中文合成态保护、Shift+Enter 换行、会话草稿和附件隔离、流式跟随与历史阅读保护 |
| 窄窗与弹窗 | 容器分级收缩、表单单列、长文本换行、低高度目录与可滚动弹窗；发送及底部确认操作可达 |

## 来源与适配边界

上游固定为 `f504349419118a32804ce3a7fae74593070bf945`。原样主题、MIT 许可和文件来源记录在 `third_party/open-claude-ui/`；许可证与 provenance 同时进入应用包及第三方声明。

上游提供组件示例和设计文档，没有本产品六模块的业务页面，也没有完整 Markdown renderer/prose CSS 或字体二进制。按钮、气泡、代码块、附件等有源码的部分按源码移植；Markdown 缺少的节点数值及业务响应式按 CDS 补齐，具体数值和选择依据见重构契约。字体采用同一回退栈，不宣称随包分发 Anthropic 字体；代码块保持上游能力，不宣称具备语法着色引擎。

代码复制在原有网页权限拒绝策略下会失败，已通过窄文本写入 Bridge 修复。主进程校验可信 Renderer、当前主窗口及文本长度后写入剪贴板，不提供读取接口，不放宽浏览器权限。实机复制并粘贴验证保留缩进、换行及长行。

## 确定性验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npx vitest run src/renderer/src src/main/prototype-contract.test.ts src/main/window-security.test.ts src/shared/desktop-contract.test.ts` | 20 个文件、255 项通过 |
| `npx electron-vite build` | 主进程、Preload、Renderer 生产构建通过 |
| `npm run prototype:check:layout` | 通过；分别检查新桌面与历史 Web 原型 |
| `npm run prototype:check:typography` | 通过 |
| `git diff --check` | 通过 |

测试覆盖 Markdown 节点与安全链接、完整长消息、附件插槽、复制成功/失败及计时、输入法、草稿、滚动、侧栏、嵌套弹窗、菜单焦点和原有业务展示。测试和构建原始输出保存在[证据目录](evidence/2026-10-16-open-claude-ui/)。

## 真实桌面验收

通过真实 Electron 窗口操作完成以下检查，Markdown 使用明确标注的离线样例，不调用模型。

| 逻辑窗口尺寸 | 观察与结果 |
| --- | --- |
| 600×400 | 折叠导航、低高度目录、员工详情与设置、能力及连接；表单和确认按钮可达，代码与表格局部横向滚动 |
| 960×640 | 草稿恢复、上下文目录与按需事项边栏，正文和常驻输入区可用 |
| 1200×800 | 六模块、关键弹窗、用户/AI 消息、附件和 GFM；实际代码复制粘贴成功 |
| 1600×1000 | 浅/深色布局与居中阅读宽度，正文保持宽度约束 |

隔离开发验收使用 `/tmp/ai-employee-open-claude-responsive-profile`；最终应用包使用 `/tmp/ai-employee-open-claude-packaged-profile`。离线消息仅写入测试 profile，样例在[markdown-fixtures.json](evidence/2026-10-16-open-claude-ui/markdown-fixtures.json)。界面样例不作为真实模型生成或工具执行证据。

主要截图为 Retina 图像，像素尺寸可能是逻辑窗口尺寸的两倍：

- [最终应用包欢迎页，1200×800](evidence/2026-10-16-open-claude-ui/screenshots/packaged-welcome-light-1200.png)
- [最终应用包个人资料，1200×800](evidence/2026-10-16-open-claude-ui/screenshots/packaged-profile-light-1200.png)
- [Markdown 与消息排版，1200×800](evidence/2026-10-16-open-claude-ui/screenshots/cds-markdown-light-1200.png)
- [用户与 AI 附件，1200×800](evidence/2026-10-16-open-claude-ui/screenshots/cds-message-attachments-light-1200.png)
- [低高度目录，600×400](evidence/2026-10-16-open-claude-ui/screenshots/cds-directory-drawer-600.png)
- [窄窗口连接弹窗底部操作](evidence/2026-10-16-open-claude-ui/screenshots/cds-connection-dialog-bottom-600.png)
- [会话草稿，960×640](evidence/2026-10-16-open-claude-ui/screenshots/cds-conversation-draft-dark-960.png)
- [深色大窗口，1600×1000](evidence/2026-10-16-open-claude-ui/screenshots/cds-welcome-dark-1600.png)

## 应用包与改动隔离

本地应用包位于 `build/local-release/dist/AI Employee OS-darwin-arm64/AI Employee OS.app`，已从其 `app.asar` 启动并查看最终界面。它使用既有已封装 Runtime 和签名 helper；本轮没有重建或重签 helper。

- 14 个构建输出与 `app.asar` 中对应主进程、Preload 和 Renderer 文件逐字节一致，见[封装核对](evidence/2026-10-16-open-claude-ui/asar-verification.json)。
- 与已有候选包比较的 3656 个非生成 Runtime 资源文件无差异；660 个 Python 缓存文件排除，其中 90 个发生生成路径相关变化，见[包资源核对](evidence/2026-10-16-open-claude-ui/package-verification.json)。
- 与本轮开始时的快照相比，95 个受保护的 Runtime / Provider 源文件保持一致；未发现越界改动，见[工作区核对](evidence/2026-10-16-open-claude-ui/worktree-verification.json)。主进程及 Preload 的新增行为为界面代码复制桥，窗口参数按 CDS 调整。
- `app.asar` SHA-256：`e99b601733938963318a4404d2a05ac27159cf326926fb48d3a04550ea322505`。

本轮完成 UI、交互回归和本地封装验收。没有重新执行真实 Provider 生成、外部写入或发布级签名、公证验收；未替换现有已安装客户端，未提交或推送工作区修改。
