# AI Employee OS

一个 Local-first 的个人 Agent 团队工作台。

本项目从零开始，以用户与“总管”的自然语言对话为唯一正式工作入口。总管负责识别意图、组织用户创建并发布的 Agent 员工、审核执行结果，并向用户交付可验证产物。

当前目录仅保留本轮从零设计产生的方案，不继承旧实现。

## 当前事实源

1. [MVP 产品规格](docs/product-spec.md)
2. [系统架构方案](docs/system-architecture.md)
3. [实施路线图](docs/implementation-roadmap.md)
4. [Phase 0：Eigent 客户端壳审计](docs/audits/phase-0/eigent-client-shell-audit.md)

发生冲突时，以产品规格为产品边界，以系统架构方案为技术边界；实施路线图不得扩大前两者定义的 MVP。

## 当前阶段

产品规格 v0.1 已冻结，Phase 0 外部依赖审计进行中。Eigent 子审计已完成：不采用整仓 Fork，Phase 1 将新建最小 Electron 骨架并只抽取通过逐文件审计的通用组件。下一步继续审计 Deep Agents、TencentDB Agent Memory、模型 Provider、agent-reach 与多进程安全边界。
