# Release 2：Execution and Evidence

> 历史里程碑快照，非现行产品入口。现行能力与边界以根目录 `AGENTS.md` 与 [架构总览](../架构总览.md) 为准。

## 目标

把 Skill Workflow、Tool Loop 和 Eval Set 从静态描述升级为可执行、可恢复、可审计的运行机制。Release 2 复用 canonical Task/Action/ToolExecution，不引入 LangGraph，也不建立第二套节点状态。

## 标准映射

- `pm-ai-agent-book/book2`：采用 Tool Loop、Graph、Harness + Eval 的职责、状态、失败和验收边界。
- `bojieli/ai-agent-book`：采用有限循环、显式 Observation、案例级评估和可复现实验报告。

## Graph Runtime

- 从已安装且版本锁定的 Skill Manifest 读取 `runtime-dag-v1`。
- 校验唯一 Step、已知依赖、无环、`max_steps`、Timeout、Retry 和 Tool Route。
- 每个 Step 物化为 canonical Action；Graph 元数据进入 `input_json`，状态仍只使用 Action 状态机。
- 重启时从 Task Snapshot 与已物化 Action 重建锁定 Graph，不依赖可能被升级覆盖的当前 Skill；无副作用节点可安全回到 `pending`，副作用节点沿用 `result_unknown` 规则。
- 依赖未成功时禁止启动下游；状态更新使用 CAS。
- 有副作用节点禁止自动重试；Tool Route 来自锁定 Graph Node，不由 Worker 自由选择。
- Golden Path 的 `analyze -> write` 两个节点均进入运行结果 Evidence。

## Tool Loop

- Planner Decision 与 ToolResult 使用闭合协议。
- 限制最大 Step 和最大 Tool Call。
- 同一 Loop 内禁止重复 `call_id` 或 `idempotency_key`。
- 独立校验 Observation 的 Schema、Call ID、Status 和 Side Effect State。
- 任意非 `succeeded` 结果立即停止 Loop；`result_unknown` 进入人工核验，禁止继续规划或重放。

## Harness + Eval

- Suite Manifest 固定 12 个案例及各分类最小覆盖，缺少 Standard、Missing Information、Conflicting Sources、Tool Failure 或 Memory Conflict 任一分类即拒绝运行。
- Tool Failure 案例真实调用 Rust ToolExecutor；产物案例读取真实 Markdown 后执行冻结 Rubric。
- Gate 要求每个 Case 达标且 Suite 平均分达标，不允许平均分掩盖单例失败。
- `EvalReport` 固化 Dataset/Subject 版本与 SHA-256；Summary、分类通过率、失败案例和 Gate 由逐案例结果重算并接受契约语义校验。

## 验收

1. Manifest DAG 真实物化为两个 Action，依赖未满足时 `write` 无法启动。
2. Golden Path 返回 Graph Evidence，所有 Required Node 成功后 Task 才能成功。
3. Tool Loop 遇到重复 Call 或 `result_unknown` 必须停止。
4. 12 个固定 Eval Case 经过真实 Rust Gateway/Artifact 路径并全部通过。
5. `./scripts/check.sh` 覆盖 Graph、Loop、Eval Report Contract 和跨进程 Golden Path。

## 非范围

动态图自修改、并行节点调度、Multi-Agent Graph、自动补偿事务、在线学习或以 Eval 自动修改 Prompt。
