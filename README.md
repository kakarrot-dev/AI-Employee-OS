# AI Employee OS

一个 Local-first 的个人 Agent 团队工作台。

本项目从零开始，以用户与“总管”的自然语言对话为唯一正式工作入口。总管负责识别意图、组织用户创建并发布的 Agent 员工、审核执行结果，并向用户交付可验证产物。

当前目录仅保留本轮从零设计产生的方案，不继承旧实现。

## 当前事实源

1. [MVP 产品规格](docs/product-spec.md)
2. [系统架构方案](docs/system-architecture.md)
3. [实施路线图](docs/implementation-roadmap.md)

发生冲突时，以产品规格为产品边界，以系统架构方案为技术边界；实施路线图不得扩大前两者定义的 MVP。

## 当前阶段

处于方案冻结前阶段，尚未开始代码实现。下一步先审计 Eigent、Deep Agents、TencentDB Agent Memory 与 agent-reach 的可复用边界，再建立新代码骨架。
