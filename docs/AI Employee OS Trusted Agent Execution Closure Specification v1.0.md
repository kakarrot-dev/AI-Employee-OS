# AI Employee OS Trusted Agent Execution Closure Specification v1.0

## 1. 目标

本规范修复 Generic Run 与 Multi-Employee Business Flow 已声明契约和真实实现之间的偏差。目标不是增加新能力，而是保证每个成功状态都能由同一条可信证据链证明：

```text
用户目标
  -> 最终模型可见 Context（有界、可追溯）
  -> AgentDecision（仅候选动作/候选完成）
  -> Rust 授权与副作用事实
  -> Candidate Deliverable
  -> Deterministic Evaluation + Acceptance Criteria
  -> Verified Deliverable
  -> Task succeeded / authorized Handoff
```

## 2. 范围

包含：模型 Context 与预算、取消竞态、Tool 子进程 Secret 隔离、`result_unknown` 收敛、完整 JSON Schema 校验、Run Evaluation、WorkOrder Acceptance、SharedContextRef/Handoff、崩溃恢复、Eval 门禁。

不包含：并行 Multi-Agent、LLM Judge、远程 Feature Flag、自动自我修改、Cloud Sync、任意 MCP Tool。

## 3. 不变量

### 3.1 完成与验证

1. `complete` 只产生 Candidate；不得直接写 `verified` 或 `score=1.0`。
2. Output 必须递归满足 Skill JSON Schema，包括嵌套对象、数组和 `additionalProperties`。
3. Deterministic Evaluation 至少检查 result、trajectory、side_effect、recovery、cost、risk；任一确定性失败不得被模型覆盖。
4. WorkOrder 必需 Acceptance Criterion 必须有对应类型的可定位 Evidence。
5. 只有 Evaluation `delivery_allowed=true` 才能原子写入 verified Deliverable 与 Task succeeded。

### 3.2 Context

1. 预算对象是 Python Provider 最终接收的完整消息，而不是 Rust 中未被消费的旁路对象。
2. Context 必须包含 Runtime Policy、Agent Prompt、当前 Capability、Tool Surface、Task、授权共享引用和 Observation，并保留 trust/source/hash。
3. Python 不得重新拼接一套未计量的 Skill/Tool 内容。
4. Knowledge、ToolResult、Handoff 内容以 `untrusted_data` 进入，不因被 JSON 包裹而提升信任级别。

### 3.3 取消与不确定副作用

1. Cancellation Request 是持久化停止令牌；模型返回、Action 创建、Tool 开始、Deliverable 提交前都必须重新检查。
2. 取消与推进使用条件更新或 Immediate Transaction，terminal Run 不得被改回非终态。
3. Side-effecting Tool 超时后，在执行单元确认退出前不得允许人工终态收敛。
4. 人工核验 Evidence 必须包含核验方法、观察值与时间；固定占位 JSON 不构成证据。

### 3.4 Secret 与 Tool 进程

1. 模型 API Key 只进入需要调用模型的受控 Python Worker。
2. Tool 子进程使用显式环境白名单，不继承 `DEEPSEEK_API_KEY` 或其他无关 Secret。
3. 外部 Tool 可执行路径必须来自受信任安装位置或经过可验证的显式配置。

### 3.5 Handoff 数据平面

1. Handoff 接受前验证 Deliverable、Evidence、Artifact Hash、Sensitivity、Target Agent allow-list 和 Acceptance Criteria。
2. 接受时创建 `SharedContextRef`；下游 Context Pipeline 解析引用为有界摘要与结构化输出，不复制私人 Conversation、Memory 或完整 ToolResult。
3. 未授权、Hash 不匹配或来源消失时默认拒绝，下游不得启动。

## 4. 状态提交顺序

所有成功收敛在一个数据库事务中完成：

1. 再检查 Task=`running`、Run 非 terminal、无未确认 cancellation、无 `result_unknown`。
2. 递归验证 output schema。
3. 创建 Candidate Deliverable 与类型化 Evidence。
4. 执行 Deterministic Evaluation 和 WorkOrder Acceptance。
5. 通过后将 Deliverable 改为 `verified`，写 Evaluation Evidence，Task=`succeeded`，Run=`terminal`。
6. 任一步失败：Deliverable 保持 candidate 或 rejected，Task 不得 succeeded。

## 5. 恢复矩阵

| 中断点 | 恢复结果 |
|---|---|
| model/context 阶段，无副作用 | Run failed=`interrupted_before_decision`，可由用户新建 Run |
| Action 已持久化、Tool 未开始 | Action failed/cancelled，不执行 Tool |
| Tool running，side_effect=`none` | failed，可安全重试为新 Action |
| Tool running，可能有副作用 | `result_unknown`，等待人工核验 |
| Candidate/Evaluation 阶段 | 重放确定性验证，不重复 Tool |
| 已 verified、Task 未终态 | 幂等完成 Task |

## 6. 验收

- 恶意 ToolResult 不能改变 Capability/权限，审批展示具体 Tool、Action、Resource 和参数摘要。
- 取消模型调用后不会出现新 Action/Approval。
- 外部 Tool 进程看不到 DeepSeek Key。
- 嵌套类型错误的输出不能成为 Deliverable。
- Acceptance 不满足时 Handoff 和 Root completion 均失败关闭。
- 下游员工能读取授权的上游 Deliverable 摘要/结构化输出，不能读取未授权内容。
- 关键恢复边界有故障测试；`./scripts/check.sh` 执行仓库 Skill Eval 数据的结构与覆盖门禁。
