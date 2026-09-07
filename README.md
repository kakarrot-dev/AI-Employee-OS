# AI Employee OS 客户端交互原型

此分支 `codex/client-prototype` 用于向开发人员交付可安装的 macOS 界面与交互设计。保留客户端的五个一级入口：消息、通讯录、能力、连接、系统。业务数据、任务进度、模型验证及连接状态全部使用 mock，不需要后端、模型账号或 Python 环境。

## 开发与预览

使用 `package.json` 中指定的 Node.js / npm 版本：

```sh
npm ci
npm run dev
```

`npm run dev` 直接启动 Electron 和前端热更新，不编译任何原生助手，也不启动 Agent 运行服务。前端热更新端口仅用于开发预览，安装后的应用直接加载本地页面。

```sh
npm run check:boundary
npm run typecheck
npm test
npm run prototype:check:typography
npm run prototype:check:layout
npm run build
npm run preview
```

## 生成与安装原型

当前打包目标为 Apple Silicon macOS：

```sh
npm run package:local
```

产物为：

```text
build/prototype-release/dist/AI Employee OS Prototype-darwin-arm64/AI Employee OS Prototype.app
```

将 `.app` 复制到“应用程序”后打开。`npm ci` 首次安装依赖时需要下载 Electron；打包复用本地已安装的 Electron，不重复下载。应用运行无需后端网络服务。此开发分发包未做 Developer ID 签名或公证；若 macOS 阻止启动，可在“系统设置 → 隐私与安全性”中允许打开本次构建，不必关闭系统安全功能。

应用名称为 **AI Employee OS Prototype**，Bundle ID 为 `com.kakarrot.ai-employee-os.prototype`，用户数据目录独立存放在 `~/Library/Application Support/AI Employee OS Prototype`。可与正式客户端并存，原型不会读取或修改正式客户端的数据。

## 演示数据与恢复

点击“交互原型 · Mock”可选择正常完成、执行失败、等待审批或直接回答场景，并可重置演示数据。会话、员工配置与任务快照保存到独立原型的 `localStorage`，键为 `ai-employee-os.prototype.mock.v1`；存储不可用时只能保留当前页面会话，写入失败会提示。文件附件只在当前页面内存中保存，关闭窗口或刷新后需要重新选择。

模拟任务依赖当前页面的计时器，关闭窗口后不会继续运行。重新打开时，存档中处于执行中的任务会变为失败，可在界面重试；已完成结果和待审批状态按存档恢复。重置只影响本原型的 mock 数据，不清理正式客户端的数据。

`npm run check:boundary` 检查后端目录、依赖、模块导入，以及已有构建与安装包的后端残留；构建时会自动执行。

## 开发交接边界

- `src/renderer`：实际演示界面、交互和 mock 数据；接入真实服务时，以这些页面状态与反馈作为验收参考。
- `src/shared`：界面所需的数据类型、状态定义和布局约束，不含 Agent 执行实现。
- `src/main/index.ts`：仅负责安全 Electron 窗口、菜单与生命周期，无 preload、IPC 业务处理或后台进程。
- `prototypes/macos-client-v2`：客户端直接复用的样式、图标资源与历史设计参考，不是独立 Web 产品交付物。
- `docs/macos-client-component-contract.md`：布局、组件和 mock 数据边界。

此分支已移除 Agent Runtime、Provider、Worker、数据库与记忆服务、Keychain 助手、飞书 OAuth 后端、原生编译脚本、运行时装配与旧后端文档。模型调用、工具执行、第三方授权和外部消息发送均不发生；文件交互只用于原型演示，不代表真实任务读取与处理。

后续业务开发应在明确的产品实现分支接入真实服务，不能把 mock 的成功状态当作后端已验收。正式产品代码保留在原有分支，本分支仅承载原型。

开发人员可阅读 [原型交接与状态契约](docs/prototype-handoff.md)。打包同时生成 `build/prototype-release/AI-Employee-OS-Prototype-mac-arm64.zip`，用于分发给验收人员。
