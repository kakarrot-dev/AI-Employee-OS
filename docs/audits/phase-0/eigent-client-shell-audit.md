# Phase 0：Eigent 客户端壳审计

日期：2026-08-31

结论状态：已完成

审计对象：Eigent `v1.0.3` 对应源码快照 `92f17b596ce2ae27977d6db2f0ed11a81560115f`

## 1. 决策

**不采用 Eigent 整仓 Fork 作为 AI Employee OS 的客户端基线；采用“新建最小 Electron 骨架 + 按文件审计后抽取通用组件”的方案。**

- **No-Go：整仓 Fork 后删除原业务。** 原 Renderer、Electron Main、Preload、认证、后端安装、终端、浏览器、文件系统和更新链路高度耦合。保留整仓再删减会继承过大的高权限攻击面、云端依赖和持续合并成本。
- **Go：受控组件抽取。** 只允许抽取许可证与依赖均已核实、没有产品状态或高权限 IPC 依赖的 UI Primitive、纯函数及少量窗口交互思路；不直接复制原产品壳、路由、页面、状态管理或 IPC 桥。
- **Phase 1 的实现基线改为新骨架。** Eigent 是带来源的参考实现和候选组件来源，不再是运行时代码基线。

该决策满足 Phase 0 门禁中的第二条路径：无法证明原产品壳能以可接受成本与 Runtime 解耦，因此明确切换到组件抽取方案。

## 2. 审计基线与方法

| 项目 | 事实 |
| --- | --- |
| 官方仓库 | [eigent-ai/eigent](https://github.com/eigent-ai/eigent) |
| 固定快照 | [`92f17b5`](https://github.com/eigent-ai/eigent/tree/92f17b596ce2ae27977d6db2f0ed11a81560115f) |
| 快照说明 | `release v1.0.3 (#1880)`，提交时间 2026-08-28 |
| 技术栈 | Electron、React、TypeScript、Vite；Python FastAPI/CAMEL 后端 |
| 审计方式 | 固定提交浅克隆、静态依赖与权限面扫描、兼容 Node 22 隔离安装、Web Production Build |

审计只验证固定快照，不把上游 `main` 后续变化视为已审计内容。

## 3. 关键证据

### 3.1 产品壳与原 Runtime 高度耦合

- `src` 中共有 588 个 TypeScript/TSX 文件；至少 111 个文件直接导入 `@/api` 或 `@/service`，至少 73 个文件依赖 Host/Electron IPC。
- `App.tsx` 启动时即挂载执行订阅、后台任务处理、触发器自动执行和远程控制桥；它不是纯展示根组件。
- `ConnectionProvider`、认证路由和主 `Layout` 共同把 Brain 后端端口、健康检查、安装状态、登录与页面可见性绑定在一起。
- `Workspace`、`TopBar`、`SpaceSidebar` 等主要壳层组件同时依赖聊天、项目、浏览器、终端、触发器、更新和云端状态，不能按页面级直接保留。
- `AppHost` 将 `electronAPI` 与 `ipcRenderer` 都声明为 `any`，Host 抽象没有形成可验证的最小权限契约。

因此，“删掉后端目录即可得到空客户端壳”的前提不成立。

### 3.2 Electron 权限边界不符合目标架构

- `electron/main/index.ts` 约 4,110 行，Electron Main 目录注册约 95 处 `ipcMain.handle/on`；Preload 约 448 行并包含约 92 处 IPC 调用或监听。
- Preload 向 Renderer 暴露通用 `ipcRenderer.on/off/send/invoke`，Renderer 可以按字符串调用主进程已注册通道，无法形成按能力列举、按参数校验的最小接口。
- 主窗口启用 `nodeIntegration: true` 和 `webviewTag: true`；`open-win` 子窗口还使用 `contextIsolation: false`。
- 主进程同时承载 PTY、浏览器/CDP、文件读写与删除、环境变量、MCP 安装、命令执行、后端安装/重启和自动更新等能力。即便部分通道存在校验，整体权限面仍远大于空客户端壳所需范围。
- 更新器显式设置 `verifyUpdateCodeSignature = false`，并默认连接 Eigent 的发布链路，不能进入本产品的签名和升级信任链。

AI Employee OS 必须重新定义窄、强类型、版本化的 IPC Allowlist；原 Main/Preload 不进入抽取范围。

### 3.3 云端与打包运行时不是可删除的旁路

- 开发环境默认引用 `dev.eigent.ai`、`www.eigent.ai` 与 `remote.eigent.ai`，认证还依赖 Stack 相关配置。
- 原打包流程会准备 Python/uv、后端虚拟环境、终端虚拟环境和示例 Skill，并将 Backend 与 Prebuilt Runtime 作为额外资源打包。
- 原更新器、OAuth Scheme、远程控制、价格/额度和云存储提示均属于 Eigent 产品语义，而非通用桌面壳职责。

上游打包脚本可作为“新 Mac 无全局 Python/Node”的工程参考，但其资源集合和运行时代码不能直接沿用。

### 3.4 可构建不等于可复现或可解耦

在隔离目录中使用兼容的 Node `v22.23.2` 执行：

```text
npm install --ignore-scripts --package-lock=false --no-audit --no-fund
npm run build:web
```

结果：Vite Production Build 成功，6,900 个模块完成转换。

验证边界：

- 上游没有提交 npm/yarn/pnpm/bun 的前端 lockfile，依赖解析结果不能按提交精确复现。
- 安装跳过了生命周期脚本；本次没有验证 Python/uv、原生模块、桌面打包、签名、公证和实际运行。
- 构建报告缺失 Palatino 字体、Stack 模块循环 chunk、Host 模块静态/动态混用，以及多个超过 500 kB 的 chunk；主 Workspace chunk 约 1.25 MB，另有约 2.93 MB 和 3.35 MB 的大 chunk。

该结果只证明固定快照的 Web Renderer 在一次兼容环境中可编译，不推导桌面产品可运行或壳层可抽离。

### 3.5 许可证存在元数据冲突

- 根目录 [`LICENSE`](https://github.com/eigent-ai/eigent/blob/92f17b596ce2ae27977d6db2f0ed11a81560115f/LICENSE)、README 和 GitHub 仓库元数据均指向 Apache License 2.0。
- 同一快照的 [`package.json`](https://github.com/eigent-ai/eigent/blob/92f17b596ce2ae27977d6db2f0ed11a81560115f/package.json) 声明 `MIT`，仓库根目录没有 `NOTICE`。

工程上按更保守的 Apache-2.0 义务处理：抽取文件保留原版权与许可证头，发布时生成第三方声明和变更说明。许可证元数据冲突须在首次分发任何 Eigent 派生代码前向上游确认；本审计不是法律意见。

## 4. 保留、改写、删除清单

| 分类 | 范围 | 决策与条件 |
| --- | --- | --- |
| 可候选抽取 | `src/components/ui` 中的通用 Primitive | 共 65 个文件；除 `sonner.tsx` 发现直接依赖 `authStore` 外，多数没有直接产品 Store/API/Host 依赖。仍须逐文件核对传递依赖、资产许可证和实际需要，不批量复制。 |
| 可参考 | Design Token 生成流程、Tailwind/Radix 组合方式 | 仅参考工程方法。视觉事实源仍是 Bloome；Palatino 字体文件在快照中缺失，不进入抽取范围。 |
| 可参考 | electron-builder 的多平台结构、应用内 Runtime 资源打包思路 | 重新实现产品自己的签名、公证、更新验证、资源清单和回滚；不复制 Eigent 更新源及 Prebuilt Runtime。 |
| 需要重写 | 窗口壳、导航、菜单、重连、主题 | 在新骨架中按 MVP 六模块实现，不沿用 Eigent 页面状态和云端语义。 |
| 需要重写 | Host/IPC | 使用强类型、版本化、按通道列举的最小接口；Main 验证 Sender、Schema、RunGrant 和资源范围。 |
| 禁止复用 | `App`、Router、`Layout`、Workspace、TopBar、SpaceSidebar、认证与 Store | 与原 Backend、Cloud、产品对象和自动执行链路耦合。 |
| 禁止复用 | Electron Main/Preload 整体 | 权限面过大，存在通用 IPC 暴露、Node Integration、Webview 和更新签名验证关闭等不符合项。 |
| 删除/替换 | `backend`、`server`、CAMEL Runtime、远程控制、触发器、Workspace Bundle、原 Tool/MCP/终端/浏览器执行 | 不属于目标架构；后续只能经 Local Control Runtime 与 Tool Gateway 按产品契约重新接入。 |
| 删除/替换 | Stack 认证、Eigent Cloud、额度/价格/存储、Eigent OAuth/CDN Updater | MVP 为 Local-first 且不包含账户与 Cloud Sync；更新链路必须归属于本产品。 |

## 5. Phase 1 输入与验收补充

Phase 1 从空目录建立最小 Electron + React + TypeScript 骨架，并满足：

1. Renderer 不启用 Node Integration，不开放 `webviewTag`；Context Isolation 保持开启。
2. Preload 不暴露通用 `ipcRenderer`，只暴露经过版本化 Schema 定义的产品方法和事件。
3. 初始 Main 只包含窗口、菜单、生命周期和受认证 Runtime 连接所需能力；每增加一个高权限通道都要有用途、调用方、参数 Schema、Sender 校验和失败行为。
4. 六个一级模块只使用本地占位数据导航，客户端不能直接调用模型、Tool 或上游 Backend。
5. 抽取组件以逐文件清单进入代码库，记录上游 Commit、原路径、许可证、修改说明和传递依赖；未通过清单审计的文件不复制。
6. 自动更新在签名、公证、代码签名验证和回滚设计完成前不进入 Phase 1。
7. 提交 lockfile，并固定 Node 与包管理器版本，保证客户端依赖安装可复现。

## 6. 未关闭风险

- Eigent 根许可证与 `package.json` 许可证元数据冲突，首次分发派生文件前需取得明确解释。
- 本轮没有验证上游 Desktop Build、运行时安装、签名、公证、自动更新和第三方字体授权，因为这些路径不会作为本产品基线复用。
- 每个候选 UI 文件仍需在实际抽取时完成传递依赖和资产许可证复核；“位于通用 UI 目录”不等于自动可复用。

## 7. 门禁结果

| Phase 0 Eigent 门禁 | 结果 |
| --- | --- |
| 锁定官方源码与版本 | 通过 |
| 核实许可证事实 | 有条件通过：按 Apache-2.0 保守处理，元数据冲突待上游确认 |
| 证明原产品壳可与 Runtime 低成本解耦 | 不通过 |
| 明确替代路径 | 通过：新建最小骨架并逐文件抽取组件 |
| 为 Phase 1 定义安全与可复现约束 | 通过 |

**最终判定：Eigent 子审计完成，允许 Phase 0 继续审计其他外部依赖；Phase 1 只能按组件抽取方案启动。**
