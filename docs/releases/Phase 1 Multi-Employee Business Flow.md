# Phase 1 Multi-Employee Business Flow

> 产品状态更新（2026-08-12）：已按本文回滚约定隐藏客户端「场景库」新建、AI 提案和 `business-flow-start` 入口。Runtime 契约、历史 Flow、只读/恢复能力、Migration、Audit 与 Artifact 保留。本文件继续记录 Phase 1 历史发布事实，不再代表当前客户端导航。

> 状态：Release Candidate；本地确定性门禁与真实 macOS 界面已验证，真实 DeepSeek / Exa 多员工端到端尚未验证。

## 用户能力

macOS 新增「场景库（暂定）」。用户可以让受限 AI 场景协调器提出草案，也可以手工配置串行业务流；两种入口共用同一确认编辑器。确认后的不可变 Scenario Version 可启动为 Business Flow，并在工作库查看 WorkOrder 时间线。

Phase 1 的标准路径为：

```text
Scenario Definition / immutable Version
  → Root Task（Rust 编排，不创建 AgentRun）
  → A Child Task / Generic Run
  → verified Deliverable / accepted Handoff
  → B Child Task / Generic Run
  → verified Deliverable / accepted Handoff
  → Finalization Child Task / Generic Run
  → business_flow_outputs Root 输出绑定
  → Root Task succeeded
```

## 安全边界

- Python 场景协调器只返回草案，不访问 SQLite、不调用 Tool、不创建 Task。
- Rust 校验 DAG、员工状态、Capability readiness、预算、参与人数与 Finalization。
- 普通场景草案不得携带 Conversation、Employee Memory 或任意 Context 引用。
- 下游 Child 只接收 Rust 验证并接受的 `deliverable:<id>` Handoff 引用。
- 所有 Tool 调用继续经过 Rust ToolExecutor、Permission、Approval 和幂等检查。
- Root Task 不创建伪造 AgentRun；Root 输出通过 `business_flow_outputs` 绑定真实 Finalization Deliverable。
- `result_unknown` 不自动重放，Flow 投影为 `verification_required`。

## 安装与升级

- Migration 014 创建 Scenario、Flow、WorkOrder、Dependency、Handoff 与 SharedContextRef 数据关系。
- Migration 015 追加 Root Task 到 Finalization Deliverable 的输出绑定。
- Migration 只向前应用；不得删除或修改既有 Audit、Artifact、Deliverable、Handoff 或运行记录。

## CLI

```text
scenario-list / scenario-get / scenario-propose / scenario-validate
scenario-save / scenario-disable
business-flow-plan / business-flow-start / business-flow-list
business-flow-status / business-flow-continue
cancel-task / recover-runtime / continue-run / resolve-action-result
```

AI 草案在 `scenario-save --confirmed` 前不会持久化。Flow start 必须携带与当前不可变版本一致的 plan hash；相同 Flow ID 和 hash 幂等返回，冲突 hash 拒绝。

## 失败、恢复与取消

- `failure_policy=stop`：取消未启动下游，Root failed。
- `failure_policy=ask_user`：Root 保持 running，写入 `business_flow.waiting_user`。
- Runtime 重启从 canonical Task、AgentRun、Action、ToolExecution、Handoff 与输出绑定恢复，不根据 UI 或消息文本推断。
- Root cancel 传播到未终结 Child；已确认副作用不回滚。
- 可能已发生副作用的中断进入 `result_unknown`，只能人工核验。

## 已验证证据

- `A → B → Finalization → Root` 三节点确定性 Fake Decision 端到端。
- AI 草案确认前 Scenario Version、Task、Action、ToolExecution 均为零。
- Handoff 缺 verified Deliverable/Evidence 时不解锁下游。
- Runtime recovery 前后 AgentRun、Handoff、ToolExecution 数量不增加。
- Flow 终态再次 continue 只返回投影，AgentRun、Action、ToolExecution、Deliverable、Artifact、Handoff 数量不增加。
- Root cancel、plan hash 冲突、失败策略、员工/预算上限和私人 Context 拒绝。
- 固定安全样例覆盖私人 Conversation 引用、缺失预算、伪造 Permission 与 Worker 伪造 child task；拒绝发生在副作用前，Audit 不记录敏感正文。
- SwiftPM App 编译、签名、启动；场景库及手工编辑器真实窗口检查。
- App 重启后，Flow 投影携带当前 `run_id` / `run_phase` / `action_id`，可恢复审批或人工核验入口；`result_unknown` 不提供重试。
- `./scripts/check.sh` 覆盖 Rust、Python、Contract、Migration、Runtime 与 Swift Client Model。

## 尚未验证

- 真实 DeepSeek 生成多员工场景并连续执行的端到端质量与成本。
- 真实 Exa / `mcporter` 网络搜索作为默认发布门禁。
- 公证发行、自动更新、云同步、并行调度、Computer Use、Marketplace 和企业 RBAC。

## 回滚

若发现产品或安全问题，隐藏场景库新建、AI 提案和 `business-flow-start` 入口；保留 `scenario-list/get`、`business-flow-list/status`、cancel 与人工核验为只读/恢复能力。不得删除 Migration、历史 Flow、Audit、Artifact 或已确认副作用。
