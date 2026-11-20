# AI Employee OS

AI Employee OS 是一个本地优先的 AI 员工工作台实验。桌面客户端把 Agent 组织成可以对话的员工，事项流程把需要持续跟进的工作单独记录下来。

## 当前功能

- **员工广场**可以搜索当前工作区的可见员工、查看岗位与简介，并打开会话。
- **事项广场**提供通用事项入口。可以选择员工、提交任务与附件，查看处理进度，在需要补充信息或确认结果时继续处理。
- **角色预设**包含报价检查和审批跟进。预设基于用户提供的材料整理信息和建议，业务决定由人工确认。

当前分支是可从源码开发运行的社区版快照，尚未发布本项目的安装包。事项流程面向本地工作区。

## 从源码运行

需要 Node.js 24 或更新版本与 pnpm 10.33.0。在不同终端启动本地服务、界面和 Electron 客户端。

```sh
pnpm install --frozen-lockfile
pnpm dev:server
pnpm dev
pnpm dev:desktop
```

真实对话需要配置本机支持的 Agent CLI。验证时使用 [隔离测试环境](docs/verification/README.md) 的假 Agent，避免读取真实工作区数据。

```sh
pnpm typecheck
pnpm exec vitest run src/lib/zhimai-ready-bots.test.ts src/lib/matter-navigation-guard.test.ts src/lib/language-preference.test.ts server/matters.test.ts
```

## 上游来源

此社区版基于 [OpenMausBot 0.1.141](https://github.com/milind-soni/OpenMausBot/tree/c7e50aa190ab3c0f3b199a416100b67f730f1f90)。源代码沿用 [Apache 2.0](LICENSE)。[NOTICE](NOTICE) 与 [第三方许可](LICENSING.md) 记录上游归属与组件许可。上游企业版目录和发布工作流保留在本地来源中。
