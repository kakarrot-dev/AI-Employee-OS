# Nova macOS Client Research 2026-08-04

## 1. 定位

Nova 在本轮只作为研发侧调研角色，不安装为产品内 Agent Package，也不接入 Agent-Reach Tool。目标是为 Release 3 的 Alex macOS Client 提供可验证的产品与工程约束。

## 2. 结论

Release 3 的最高优先级不是扩展 Employee、Skill 或页面数量，而是让用户能够理解、控制和恢复一次真实 Task：历史来自 Runtime 持久化、长任务可取消、审批说明具体副作用、异常给出恢复动作、所有关键操作同时具有菜单或键盘入口。

## 3. 来源与可迁移机制

### Apple 官方

- [The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar)：关键操作应进入菜单并使用标准快捷键；菜单也是 Full Keyboard Access 的发现入口。
- [SwiftUI on the Mac: Build the fundamentals](https://developer.apple.com/videos/play/wwdc2021/10062/)：macOS 界面应保持 flexible、familiar、expansive、precise；导航放 Sidebar，主要操作放 Toolbar，并用 `searchable`、Commands 和稳定选择状态增强桌面效率。
- [Windows](https://developer.apple.com/design/human-interface-guidelines/windows)：使用系统窗口外观和可调整尺寸，不用自绘表面破坏激活、暗色和窗口层级反馈。
- [Distributing software outside the Mac App Store](https://developer.apple.com/developer-id/)：站外分发需要 Developer ID、Hardened Runtime、Notarization 和 Gatekeeper 验证；本地 Ad-hoc 签名不等于可发布。

### 同类本地 Agent 客户端

公开项目的实现只能作为模式参考，不作为质量背书：

- AgentForge：Task 列表、取消、重试、事件读取和健康检查是独立 Runtime API，而不是 UI 本地状态。
- CodexOpsStudio：持久 Session、Timeline、写入 Gate、恢复与发布确认分层呈现。
- TaskWraith：本地历史、Approval Ledger、运行 Activity、取消与打包后的 Smoke Test 形成一条可审计链。

可迁移的共同机制是：Runtime 是状态事实源；Sidebar 只显示轻量摘要；Detail 展示执行证据；危险操作明确确认；失败保留诊断与恢复入口。

## 4. 当前差距

| 优先级 | 差距 | 影响 | Release 3 验收 |
| --- | --- | --- | --- |
| P0 | `TaskStore` 只保存在内存 | 重启丢失历史，无法作为日常工具 | App 重启后从 Runtime/SQLite 恢复 Task |
| P0 | UI 使用临时 UUID，完成后才获得 Runtime `task_id` | UI 与 Audit/Trace 无法稳定关联 | 终态使用 canonical `task_id`，诊断可追踪 |
| P0 | Runtime 调用是一次性阻塞子进程 | 无事件续接与真实取消 | 后续建立长期 Runtime Client 协议 |
| P0 | Action 的 `blocked` / `result_unknown` 未投影 | 用户无法判断能否重试 | 展示 Action 原始状态及人工核验入口 |
| P0 | Bundle 依赖源码仓库定位 Runtime/Worker | `.app` 不能独立安装 | Bundle 内稳定定位并完成无仓库 Smoke Test |
| P1 | 缺 Client 单元/UI 测试 | 回归只能依赖人工检查 | 完整 Xcode 后增加 XCTest/UI Test |
| P1 | 暗色、最小窗口和完整键盘路径未验收 | macOS 原生体验证据不足 | 人工矩阵通过并保留截图/记录 |

## 5. 实现约束

1. Swift 不读取 SQLite；历史查询必须经过 Rust Runtime。
2. Swift 不复制 Task/Action 状态机，只解码闭合枚举并对未知值失败。
3. `result_unknown` 不显示自动重试，只显示人工核验。
4. 运行态取消必须最终由 Runtime 收敛并持久化，不能只删除本地 Row。
5. Sidebar 保持一个图标、一行标题、一行状态；复杂证据进入 Detail。
6. 使用系统语义颜色，Light/Dark 不建立两套硬编码主题。
7. Nova、互联网 Tool、Multi-Agent 和 Computer Use 不进入 Release 3。

## 6. 推荐顺序

1. 历史 Task 的 Runtime 只读投影。
2. canonical Task ID 与重复提交保护。
3. Action 异常状态详情。
4. 真实取消与事件续接协议。
5. Bundle 内 Runtime/Worker/Package。
6. XCTest、UI Test、视觉矩阵和签名公证。
