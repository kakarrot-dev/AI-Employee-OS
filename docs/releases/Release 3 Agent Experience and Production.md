# Release 3：Agent Experience and Production

## 目标

把 Release 1–2 的 Runtime 能力收敛为可操作、可诊断、可打包验证的 macOS MVP。Swift 只负责交互与展示，不复制 Task/Action 状态机，也不直接执行 Tool。

## Agent Experience

- SwiftPM + SwiftUI 原生 `NavigationSplitView`：左侧 Task，右侧状态、Graph Node、质量分、Skill 版本和产物路径。
- Composer 只采集任务输入；执行前显示一次性写入授权，明确范围为项目 `outputs` 目录。
- Client 通过子进程调用 Rust `run-golden`，只解析 Runtime 返回的 canonical Evidence。
- UI 只显示 `pending | running | succeeded | failed | cancelled`；Tool/Action 的 `blocked` 与 `result_unknown` 由 Runtime 收敛后呈现为失败详情，Client 不自行重试。
- 使用 Unified Logging 记录 Composer、审批后的 Task 启动和终态，不记录任务正文、产物正文或 Secret。

## Reliability 与 Safety

- Release 2 已覆盖 Side-effect Timeout → `result_unknown`、审批拒绝、重复 Idempotency、路径逃逸、未知 Schema、Worker 越权写入和重启恢复。
- Client 的 Runtime 解码使用闭合 Codable 模型；非零退出码与不合法 JSON 都转为可见失败，不伪造成功状态。
- Runtime 在后台 Task 执行，避免同步阻塞 MainActor。
- `./scripts/check.sh` 继续作为 Runtime/Contract 门禁；`swift build` 作为当前 Client 编译门禁。当前 CLT 未安装 XCTest/Testing 模块，因此不能把不存在的测试框架冒充为已通过。

## Production

- `script/build_and_run.sh` 构建 Rust + Swift，生成真实 `.app` Bundle，Ad-hoc 签名并支持 Run/Debug/Logs/Telemetry/Verify。
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

## 当前环境事实

2026-08-04 默认 macOS 26.5 SDK 与 Swift Compiler 版本不匹配；改用同机 macOS 15.4 SDK 后 Client 已完成编译和链接。当前 CLT 不含 XCTest/Testing，正式 Client 单元/UI 测试仍需完整 Xcode 工具链。

本地验收已确认：窗口、Sidebar、Composer、空输入禁用、审批取消、失败可见、目录初始化修复后真实 Task/两个 Graph Action 均为 `succeeded`，并产生通过 Rubric 的 Markdown。Computer Use 在成功结果回读时连接中断，因此“成功详情页视觉呈现”仍需后续人工复核，不能由数据库成功替代。
