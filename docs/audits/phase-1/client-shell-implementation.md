# Phase 1：空客户端壳实施与验收

日期：2026-08-31

状态：完成

## 1. 实施边界

从空目录新建 Electron + React + TypeScript 骨架，没有复制 Eigent 的 App、路由、Main、Preload、Store、业务页面、云端或 Runtime 代码，也没有抽取任何尚未逐文件核验的 Eigent UI 文件。

固定工具链：

| 组件 | 版本 |
| --- | --- |
| Node | `26.8.1` |
| npm | `11.19.0` |
| Electron | `44.0.0` |
| electron-vite | `5.0.0` |
| Vite | `7.3.6` |
| React / React DOM | `19.2.8` |
| TypeScript | `7.0.2` |
| Vitest | `4.1.11` |

版本写入 `package.json`、`.nvmrc` 和 `package-lock.json`；依赖使用精确版本。npm 只批准两个实际参与构建的 esbuild 安装脚本版本，不开放通用生命周期脚本白名单。

## 2. 产品壳

- 实现工作台、任务、团队、资源、记忆、设置六个一级模块。
- 使用 Bloome 的窄一级导航、上下文列表、宽内容区、低边框、统一圆角与轻量状态语言。
- 工作台保留总管对话区与只读任务面板；其他模块展示明确的空状态，不伪造 Runtime 数据。
- 任务页面不提供“新建任务”，保持“任务只能从总管对话产生”的产品约束。
- 实现 macOS 隐藏式标题栏、项目菜单、窗口最小尺寸与 Runtime 重连状态。

## 3. Electron 安全边界

- `app.enableSandbox()` 在 `ready` 前调用。
- Renderer 固定 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webviewTag=false`。
- Preload 单独构建为 sandbox 可执行的 CommonJS `.cjs`，只暴露 `runtime.getStatus`、`runtime.reconnect`、`runtime.onStatusChanged`，不暴露 `ipcRenderer`。
- Main 对每次 IPC 校验 Renderer URL；生产只接受打包后的 `out/renderer/index.html`，开发只接受精确 Dev Server Origin。
- 新窗口、任意导航、`webview` 附加、权限请求与权限检查默认拒绝。
- Renderer CSP 禁止对象、Frame、表单和非自身网络连接；Main 的 Session 额外拒绝非开发 Renderer 的 HTTP/HTTPS 请求。
- 本阶段没有模型、Tool、Keychain、Cloud、Updater、Shell、文件系统或远端 API 通道。

## 4. 验收证据

执行：

```bash
npm run typecheck
npm test
npm run build
node_modules/.bin/electron . --remote-debugging-port=9222
```

结果：

| 验收项 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| Vitest | 2 个测试文件、4 个测试通过 |
| Production Build | Main、Preload、Renderer 构建通过 |
| 真实 Electron 启动 | Electron 44 主进程、GPU、Network Service、sandboxed Renderer 正常启动 |
| 六模块 | CDP 读回工作台、任务、团队、资源、记忆、设置 |
| 窄 Bridge | CDP 只读回 `getStatus`、`reconnect`、`onStatusChanged` |
| Renderer Node 能力 | `process` 与 `require` 均为 `undefined` |
| Webview | DOM 中为 0，构造参数也禁用 |
| 真实重连投影 | UI 从检查状态收敛为“Runtime 尚未安装（Phase 2）” |

构建阶段曾因 sandboxed Preload 输出为 ESM 导致真实窗口空白。门禁没有接受“Build 成功”作为运行证据；将 Preload 独立改为 CommonJS 后，重新通过 IPC、DOM 与 Renderer 沙箱探测。

## 5. Phase 1 门禁

| 门禁 | 结果 |
| --- | --- |
| 六个模块可导航 | 通过 |
| 窗口、菜单和重连行为 | 通过 |
| 客户端不直接调用模型或 Tool | 通过 |
| Renderer 与 Preload 最小权限 | 通过 |
| 不存在 Eigent Runtime、Cloud、Updater 或高权限 IPC | 通过 |

Phase 1 完成，可以进入 Phase 2 Local Control Runtime 与版本化契约。
