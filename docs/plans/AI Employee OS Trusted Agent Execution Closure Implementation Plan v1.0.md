# AI Employee OS Trusted Agent Execution Closure Implementation Plan v1.0

## 1. 交付目标

按 `docs/AI Employee OS Trusted Agent Execution Closure Specification v1.0.md` 修复审查发现。各阶段必须独立通过 `./scripts/check.sh`，不建立第二套 Task/Run/Action 状态机。

## 2. Phase 1：安全与停止原子性（已完成）

- 外部 Tool Command 使用环境白名单并验证配置路径。
- Worker 等待改为可轮询子进程；检查 cancellation 与 Run deadline，必要时终止并回收。
- `request_tool`、Tool 开始、Deliverable finalize 前增加 terminal/cancellation 条件检查。
- `result_unknown` 核验使用结构化 Evidence；UI 收集/展示真实核验信息。超时执行单元未退出时保持不可收敛。
- 测试：Key 不继承、取消后禁止推进、side-effecting native call 必须完成结算、结构化人工核验。

## 3. Phase 2：唯一 Context 与预算（已完成）

- Rust 构建 canonical Model Context，包含完整 Capability/Tool/Task/Observation/SharedContext；Python 只按固定协议渲染。
- 对最终消息进行字节预算和 Hash 校验；继续 Run 时从 Snapshot 重建同一结构。
- ToolResult/Handoff 使用独立 untrusted section，禁止混入普通用户指令。
- 测试：超限失败关闭、Context 实际进入 Provider、Hash/字节数随最终消息生成，能力集合由 Rust 锁定。

## 4. Phase 3：可信交付与 Evaluation（已完成）

- 抽取共享递归 JSON Schema Validator，Run 与 Tool 使用同一实现。
- complete 先创建 candidate；确定性 Evaluation 读取真实 Run/Action/ToolExecution/Evidence 状态。
- 仅 Evaluation 通过时原子升级 verified 和 succeeded；删除固定满分路径。
- 统一 Skill Eval Case/Suite Schema；当前两个可执行 Skill 的 5 个仓库 Eval Case 全部进入 `check.sh`。扩充语义 Eval 样本属于后续质量工作，不伪装成本次 Runtime 正确性门禁。
- 测试：嵌套类型错误、缺证据、result_unknown、预算超限、Evaluation 不可用全部阻止交付。

## 5. Phase 4：Handoff 与 Acceptance（已完成）

- 复用现有 `deliverable_evidence`、`shared_context_refs` 和索引；本次不改变持久化 Schema，因此不制造空 Migration。
- 验证 WorkOrder `acceptance_json` 和 Flow `acceptance_json`；必需条件映射到类型化 Evidence。
- Handoff 同一事务创建 accepted record 与 SharedContextRef；下游 Run 解析授权引用。
- 测试：授权成功、target 不在 allow-list、Hash 改变、缺 criterion evidence、错误级联、Root finalization。

## 6. Phase 5：恢复与发布门禁（自动化已完成，真实外部依赖与视觉验收待人工）

- Recovery 扫描非 terminal Run，而不仅是 running ToolExecution；按 Spec 恢复矩阵收敛。
- 覆盖模型阶段中断、running ToolExecution 的纯调用/副作用恢复、取消后终态保护、Acceptance 缺证据等关键恢复边界。
- 完整执行 `./scripts/check.sh`。真实 DeepSeek、mcporter/Exa、打包 App 的视觉交互不属于无外部依赖自动门禁，交付时明确标注未验证。

## 7. 回滚

- Migration 只追加，旧记录保留。
- 若新 Evaluation 无法完成，失败关闭并保留 candidate，不回退固定满分。
- 若 Handoff 解析失败，下游保持 waiting_dependency，不复制内容绕过授权。
- 若外部 Tool 环境不完整，返回 dependency unavailable，不重新继承父进程 Secret。
