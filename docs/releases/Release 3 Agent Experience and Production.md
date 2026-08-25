# Release 3：Agent Experience and Production

> 历史里程碑快照（约 2026-08-04），非现行产品 Spec。文中 Company / 示例员工 / Tasks / Artifacts / Knowledge 五栏与 `run-golden` 描述已被后续迭代取代：现行导航为办公室 / 通讯录 / 工作库 / 技能库 / 工具库 / 设置；工作执行为 `run-task`。以 `AGENTS.md`、[架构总览](../架构总览.md) 与 [Main Interface Spec v2.0](../design-system/AI%20Employee%20macOS%20Main%20Interface%20Spec%20v2.0.md) 为准。

## 目标

把 Release 1–2 的 Runtime 能力收敛为可操作、可诊断、可打包验证的 macOS MVP。Swift 只负责交互与展示，不复制 Task/Action 状态机，也不直接执行 Tool。

## Agent Experience

- SwiftPM + SwiftUI 原生 `NavigationSplitView`：左侧 Task，右侧状态、Graph Node、质量分、Skill 版本和产物路径。
- App Shell 使用原生 `NavigationSplitView` 提供 Company、示例员工、Tasks、Artifacts、Knowledge 五个 Workspace；Settings 使用独立 Scene。所有页面消费真实 Runtime/Package 状态，不使用 Mock 冒充未开放能力。
- Claude Cream 是客户端唯一自定义视觉 Token，Light/Dark 共用语义角色；Artifact Preview 是完成页主锚点，原始 Event 与 Task ID 默认折叠。
- Composer 只采集任务输入；执行前显示一次性写入授权，明确范围为项目 `outputs` 目录。
- Client 通过 Bundle 内 Rust Runtime 调用 `run-golden`，只解析 Runtime 返回的 canonical Evidence；Task 事件通过持久化 cursor 续读，取消请求由 Runtime 确认收敛。
- `list-tasks` 返回 Task、Action、持久化 Event、Evaluation、产物路径和取消请求状态。App 重启后对仍为 `running` 的 Task 恢复事件游标和终态监视，不从 Swift 推测终态。
- UI 只显示 `pending | running | succeeded | failed | cancelled`；Tool/Action 的 `blocked` 与 `result_unknown` 由 Runtime 收敛后呈现为失败详情，Client 不自行重试。
- 使用 Unified Logging 记录 Composer、审批后的 Task 启动和终态，不记录任务正文、产物正文或 Secret。

## Reliability 与 Safety

- Release 2 已覆盖 Side-effect Timeout → `result_unknown`、审批拒绝、重复 Idempotency、路径逃逸、未知 Schema、Worker 越权写入和重启恢复。
- Client 的 Runtime 解码使用闭合 Codable 模型；非零退出码与不合法 JSON 都转为可见失败，不伪造成功状态。
- Runtime 缺失、进程无法启动和本地存储不可访问分别映射为可操作错误；取消请求在 Runtime 收敛前显示“正在取消”，不会提前把本地 Row 标记为 `cancelled`。
- Runtime 在后台 Task 执行，避免同步阻塞 MainActor。
- `./scripts/check.sh` 继续作为 Runtime/Contract 门禁；`swift build` 作为当前 Client 编译门禁。当前 CLT 未安装 XCTest/Testing 模块，因此不能把不存在的测试框架冒充为已通过。

## Production

- `script/build_and_run.sh` 构建 Rust + Swift，将 Rust Runtime、Python Worker 与锁定的 Agent/Skill/Tool Package 放入真实 `.app` Bundle，Ad-hoc 签名并支持 Run/Debug/Logs/Telemetry/Verify。运行数据写入用户 Application Support，不写 Bundle。
- Bundle ID 为 `com.kakarrot.ai-employee-os`，版本 `0.3.0 (3)`，最低 macOS 14。
- 当前 Entitlements 为空：不启用 App Sandbox，因为 MVP 需要启动本地 Runtime 子进程；Secret 不写入 Bundle、SQLite、Log 或 Context。
- `script/validate_distribution.sh` 校验 Plist、Bundle、Hardened Runtime 签名；只有显式提供 `DEVELOPER_ID_APPLICATION` 时才做 Developer ID 重签。
- Notarization、自动更新、DMG、崩溃上报和正式 Developer ID 发布仍是 Release 后续工作，不以本地 Ad-hoc 验证冒充已公证发布。

## 验收门禁

1. `./scripts/check.sh` 全部通过。
2. `swift build --package-path apps/macos/AIEmployee` 完成 Swift 类型检查与链接；配置完整 Xcode 后补充 Client 单元/UI 测试。
3. `./script/build_and_run.sh --verify` 能构建、启动并验证进程与签名。
4. `./script/validate_distribution.sh` 通过 Bundle、Plist、签名和 Entitlements 检查。
5. 手动 UX 验收覆盖：新建任务、审批取消、批准执行、运行态、成功证据、失败信息、键盘 `⌘N`。
6. 重启恢复验收覆盖：运行中退出并重新打开 App、取消请求恢复、历史 Event/Evaluation/产物恢复，以及终态后停止轮询。

## 当前环境事实

2026-08-04 默认 macOS 26.5 SDK 与 Swift Compiler 版本不匹配；改用同机 macOS 15.4 SDK 后 Client 已完成编译和链接。当前 CLT 不含 XCTest/Testing，正式 Client 单元/UI 测试仍需完整 Xcode 工具链。

本地验收已确认：窗口、Sidebar、Composer、空输入禁用、审批取消、失败可见、目录初始化修复后真实 Task/两个 Graph Action 均为 `succeeded`，并产生通过 Rubric 的 Markdown。Computer Use 在成功结果回读时连接中断，因此“成功详情页视觉呈现”仍需后续人工复核，不能由数据库成功替代。

当前 Command Line Tools 不包含 `XCTest` 或 Swift Testing 模块，因此 Client 自动化测试仍需完整 Xcode；本阶段以闭合模型的 Swift 编译、Rust 真实进程集成测试和真实 macOS 手动矩阵作为门禁，不能声称 Client XCTest 已通过。
