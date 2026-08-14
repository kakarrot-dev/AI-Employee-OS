---
title: AI Employee OS Unified Data Model v1.0
source: AI Employee OS 现有架构、运行时、安全、评估与工程设计文档
author:
  - system
published: ""
created: 2026-08-04
description: AI Employee OS MVP 持久化实体、关系、约束与 SQLite DDL 的单一事实源。
tags:
  - AI Employee OS
  - 数据模型
  - SQLite
formatter: system
confidence: high
---

# AI Employee OS Unified Data Model v1.0

> [!warning] 单一事实源
> 本文档是 AI Employee OS MVP 持久化模型的 canonical schema。各 Engineering Guide 只描述领域语义；实际 migration 只追加在 `storage/migrations/`，必须依据本文档生成，禁止在专题文档中维护第二套建表定义。

## 1. 模型边界

MVP canonical 数据模型现包含 28 张表；Conversation 扩展由追加 Migration 008 引入，Employee Profile 与 Prompt 追溯由追加 Migration 009 引入。

### 1.1 Conversation 扩展（2026-08-05）

- `conversations`：AI 员工的本地持久化对话。当前每名员工使用一个 active Conversation。
- `messages`：只保存用户和 Assistant 最终文本；不保存 reasoning、Secret 或 Tool 消息。
- `model_calls`：记录 DeepSeek 调用状态、模型、脱敏错误码和 Token 用量。
- Conversation 与 Task 相互独立。普通聊天不创建 Task，也不触发 Skill、Tool、Approval 或外部副作用。
- 用户新建员工默认不绑定 Skill。内置 Agent Package 可声明 bootstrap 绑定；`data-researcher` 只启用 `web-search`，`document-writer` 只启用 `local-file-operations`。Tool 继续全局安装，不新增 per-agent Tool 绑定表；员工实际 Tool Surface 只能由本次 Run 锁定的 Skill 推导。

### 1.2 Employee Profile 与 Prompt 追溯（2026-08-05）

- `agents` 继续保存员工根身份和生命周期，`personas` 继续保存沟通、思考、决策和习惯配置。
- `employee_profiles` 保存部门、使命、职责、边界、Soul、基础 Prompt 和单调递增的配置版本。
- Identity、Soul、Persona、基础 Prompt 与 Runtime 安全边界共同编译为 Effective Prompt；Swift 不拼装 System Prompt。
- `model_call_configs` 按 ModelCall 保存员工、配置版本和 Prompt SHA-256，不保存第二份 Prompt 正文或 Secret。
- 员工只有 `active | disabled` 两种持久化状态；删除不是第三种状态，而是物理移除原 `agents`、Profile、Persona、Skill 绑定、私人 Conversation、员工 Memory 与权限记录。
- 员工存在 `pending | running` Task 时禁止删除；Runtime 必须在同一写事务内再次检查并以 `employee_delete_blocked_active_work` 拒绝，客户端不得把该错误降级成停用。
- 已完成、失败或取消的工作继续保留 Task、Action、Handoff、Deliverable、Evaluation 与 Audit。`task_participant_snapshots` 保存任务创建时的最小历史身份，工作库不得依赖实时 Employee Profile 回放历史。
- 内置员工可彻底删除且不自动恢复：`ai-product-manager` 写入 `runtime_flags.default_agent_dismissed`；`data-researcher` 与 `document-writer` 写入 `runtime_flags.builtin_agent_dismissed:<agent_id>`。其历史工作均遵循同一快照保留规则。

此前定义的核心表如下：

- Identity：`subjects`
- Agent：`agents`、`personas`、`employee_profiles`
- Capability：`skills`、`agent_skills`、`tools`
- Execution：`tasks`、`actions`、`tool_executions`、`task_execution_snapshots`
- Context：`memories`、`knowledge_sources`、`knowledge_chunks`
- Security：`permissions`、`approvals`、`audit_logs`
- Evaluation：`evaluations`、`feedbacks`、`metrics`
- Runtime：`runtime_flags`

Knowledge 表示外部事实和资料索引，Memory 表示运行中形成的偏好、经验、事实判断、决策与模式。两者保持分离。MVP 通过 Knowledge Tool 检索本地资料和 `knowledge/seed` 预置内容，不包含实时网页抓取。

## 2. 实体关系

```mermaid
erDiagram
    agents ||--o| personas : has
    agents ||--o{ agent_skills : enables
    skills ||--o{ agent_skills : assigned
    agents ||--o{ tasks : executes
    tasks ||--o{ actions : contains
    tools o|--o{ actions : invokes
    actions ||--o{ tool_executions : attempts
    tasks ||--o| task_execution_snapshots : locks
    knowledge_sources ||--o{ knowledge_chunks : splits
    tasks ||--o{ approvals : requests
    agents ||--o{ approvals : submits
    agents o|--o{ audit_logs : produces
    tasks o|--o{ audit_logs : traces
    approvals o|--o{ audit_logs : resolves
    tasks ||--o{ evaluations : receives
    agents ||--o{ evaluations : assessed
    tasks ||--o{ feedbacks : receives
    tasks o|--o{ metrics : measures
    agents o|--o{ metrics : measures
```

`tasks ||--o{ approvals` 表示每条 Approval 必须属于一个 Task，而每个 Task 可以有零到多条 Approval，与 `approvals.task_id NOT NULL` 一致。

`memories.owner_id` 和 `permissions.subject_id` 是多态引用，无法由 SQLite 单一外键完整表达。MVP 不增加触发器模拟多态外键；应用层必须根据对应 type 字段验证目标是否存在，数据库层不保证这两处引用完整性。

## 3. 通用约定

- ID 使用应用层生成的字符串，数据库类型为 `TEXT`。
- 时间使用 ISO 8601 UTC 字符串，数据库类型为 `TEXT`，字段以 `_at` 结尾。
- JSON 使用 `TEXT` 存储，字段以 `_json` 结尾，并通过 SQLite JSON1 的 `json_valid()` 校验。
- 布尔值使用 `INTEGER`，只允许 `0` 或 `1`。
- 外键由 `PRAGMA foreign_keys = ON` 启用。
- 普通从属数据按关系使用 `CASCADE` 或 `RESTRICT`；审计记录通过 `SET NULL` 保留证据。
- `audit_logs` 是追加写记录。应用层不得更新或删除既有审计事件。

## 4. Canonical SQLite DDL

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  package_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE subjects (
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('user', 'company')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (type, id)
);

CREATE TABLE personas (
  agent_id TEXT PRIMARY KEY,
  communication_json TEXT NOT NULL CHECK (json_valid(communication_json)),
  thinking_json TEXT NOT NULL CHECK (json_valid(thinking_json)),
  decision_json TEXT NOT NULL CHECK (json_valid(decision_json)),
  habit_json TEXT NOT NULL CHECK (json_valid(habit_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (name, version)
);

CREATE TABLE agent_skills (
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT
);

CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (name, version)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_id TEXT,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  output_json TEXT CHECK (output_json IS NULL OR json_valid(output_json)),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'running', 'succeeded', 'failed',
      'blocked', 'result_unknown', 'cancelled'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE RESTRICT
);

CREATE TABLE runtime_events (
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (task_id, sequence),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE task_cancellation_requests (
  task_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  acknowledged_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE tool_executions (
  call_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'failed', 'blocked', 'result_unknown', 'cancelled')
  ),
  side_effect_state TEXT NOT NULL CHECK (
    side_effect_state IN ('none', 'not_started', 'confirmed', 'unknown')
  ),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trace_id TEXT NOT NULL,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
  UNIQUE (action_id, attempt)
);

CREATE TABLE task_execution_snapshots (
  task_id TEXT PRIMARY KEY,
  skill_snapshot_json TEXT NOT NULL CHECK (json_valid(skill_snapshot_json)),
  toolset_snapshot_json TEXT NOT NULL CHECK (json_valid(toolset_snapshot_json)),
  persona_snapshot_json TEXT NOT NULL CHECK (json_valid(persona_snapshot_json)),
  context_policy_snapshot_json TEXT NOT NULL CHECK (json_valid(context_policy_snapshot_json)),
  permission_snapshot_json TEXT NOT NULL CHECK (json_valid(permission_snapshot_json)),
  provider_config_snapshot_json TEXT NOT NULL CHECK (json_valid(provider_config_snapshot_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'agent', 'company')),
  owner_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (
    memory_type IN ('preference', 'experience', 'fact', 'decision', 'pattern')
  ),
  content TEXT NOT NULL,
  importance REAL NOT NULL CHECK (importance BETWEEN 0.0 AND 1.0),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memory_provenance (
  memory_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  trust TEXT NOT NULL CHECK (trust IN ('untrusted_data')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('local_file', 'seed_document')
  ),
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  index_status TEXT NOT NULL CHECK (
    index_status IN ('pending', 'indexed', 'failed', 'stale')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (source_id, chunk_index),
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'agent', 'company')),
  subject_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, resource, action)
);

CREATE TABLE scoped_permission_grants (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id) REFERENCES agents(id) ON DELETE RESTRICT,
  UNIQUE (task_id, action_id, action)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  risk_level INTEGER NOT NULL CHECK (risk_level BETWEEN 0 AND 3),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired')
  ),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  task_id TEXT,
  approval_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL
);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0.0 AND 1.0),
  metrics_json TEXT NOT NULL CHECK (json_valid(metrics_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE feedbacks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE metrics (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE TABLE runtime_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_agent_status ON tasks(agent_id, status);
CREATE INDEX idx_actions_task_created ON actions(task_id, created_at);
CREATE INDEX idx_runtime_events_task_sequence ON runtime_events(task_id, sequence);
CREATE INDEX idx_tool_executions_action_started ON tool_executions(action_id, started_at);
CREATE INDEX idx_tool_executions_trace ON tool_executions(trace_id);
CREATE INDEX idx_memories_owner_type ON memories(owner_type, owner_id, memory_type);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(index_status);
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks(source_id, chunk_index);
CREATE INDEX idx_approvals_task_status ON approvals(task_id, status);
CREATE INDEX idx_audit_logs_task_created ON audit_logs(task_id, created_at);
CREATE INDEX idx_evaluations_task_created ON evaluations(task_id, created_at);
CREATE INDEX idx_feedbacks_task_created ON feedbacks(task_id, created_at);
CREATE INDEX idx_metrics_name_recorded ON metrics(name, recorded_at);
```

## 5. 表职责与删除策略

| 表 | 职责 | 关键关系 | 删除策略 |
| --- | --- | --- | --- |
| `agents` | 当前可管理、可调度的 AI Employee 身份与包位置 | Persona、Skill、Task 的根实体 | 活动 Task 阻止删除；终态工作外键转移至系统历史主体后物理删除原 Employee |
| `task_participant_snapshots` | Task 创建时的最小员工历史身份 | 每个 Task 一份姓名、岗位与原员工 ID 快照 | 随 Task 级联删除；不因 Employee 删除而删除 |
| `subjects` | User 与 Company 的最小引用主体 | Memory 与 Permission 的应用层引用目标 | 有引用时由应用层限制删除 |
| `personas` | Agent 的沟通、思考、决策和习惯配置 | 一对一关联 Agent | Agent 删除时级联删除 |
| `skills` | 可版本化 Skill 清单 | 与 Agent 多对多 | 已分配时限制删除 |
| `agent_skills` | Agent 的 Skill 启用状态 | 连接 Agent 与 Skill | Agent 删除时级联，Skill 删除时限制 |
| `tools` | 可调用 Tool 清单 | 被 Action 引用 | 已产生 Action 时限制删除 |
| `tasks` | 一次用户任务及其状态 | 属于 Agent，包含 Action | 有审计或审批记录时限制删除 |
| `task_threads` | 工作库中的持续任务交互容器 | 通过 Binding 投影一个或多个 Task | `archived_at` 可恢复归档；`deleted_at` 仅从工作库软删除，不删除 Task/Action/Audit 证据 |
| `task_thread_task_bindings` | Task Thread 与执行 Task 的唯一投影关系 | `proposal_id` 对一句话办事非空；场景库直接启动的 Business Flow 为 `NULL` | 随 Task Thread 保留；Task 与 Thread 均使用限制删除 |
| `actions` | Agent Loop 中的单步执行 | 属于 Task，可引用 Tool | Task 删除时级联 |
| `runtime_events` | Swift 可按 Task 与 cursor 续读的 canonical 运行事件 | 属于 Task，`sequence` 在 Task 内单调递增 | Task 删除时级联 |
| `task_cancellation_requests` | 用户取消意图及 Runtime 确认 | 与 Task 一对一 | Task 删除时级联 |
| `tool_executions` | Tool 调用尝试、幂等与副作用核验记录 | 属于 Action，`idempotency_key` 全局唯一 | Action 删除时级联；有 Audit 的 Task 仍受保留规则约束 |
| `task_execution_snapshots` | Task 启动时锁定执行配置 | 与 Task 一对一 | Task 删除时级联 |
| `memories` | 用户、Agent 或公司的长期记忆 | 多态 owner | 应用层负责 owner 完整性 |
| `knowledge_sources` | 本地资料和预置资料的索引来源 | 一对多包含 Chunk | 删除 Source 时级联删除 Chunk |
| `knowledge_chunks` | 可检索文本分块及向量引用 | 属于 Knowledge Source | 随 Source 级联删除 |
| `permissions` | 主体对资源动作的允许或拒绝规则 | 多态 subject | 应用层负责 subject 完整性 |
| `approvals` | 高风险动作的人类审批 | 关联 Task 与 Agent | 保留审批链，限制父记录删除 |
| `audit_logs` | 安全与执行审计事件 | 可关联 Agent、Task、Approval | 父记录删除时置空，审计记录保留 |
| `evaluations` | Task 与 Agent 的质量评分 | 关联 Task 与 Agent | Task 删除时级联，Agent 删除时限制 |
| `feedbacks` | 用户对 Task 的评分和反馈 | 关联 Task | Task 删除时级联 |
| `metrics` | 可按 Task 或 Agent 聚合的数值指标 | 可选关联 Task、Agent | 父记录删除时置空 |
| `runtime_flags` | Runtime 持久化开关与用户选择 | 无外键；如 `default_agent_dismissed` | 可更新；删除默认员工时写入 |
| `agent_runs` | Task 的一次通用 Runtime 执行实例 | 属于 Task，保存 phase、revision 与预算 | Task 删除时级联 |
| `run_snapshots` | 锁定 Agent、单 Skill 或 Capability Set、Toolset、Context、Model 配置 | 属于 Run，每种类型唯一 | Run 删除时级联 |
| `run_observations` | 已确认的模型决策、ToolResult 和继续输入 | Run 内 sequence 单调递增 | Run 删除时级联 |
| `run_checkpoints` | 副作用边界上的可恢复状态 Hash | 属于 Run revision | Run 删除时级联 |
| `artifacts` | 外置结果的 URI、Hash 与验证状态 | 属于 Task/Run，可引用 Action | 数据库删除不自动删除文件 |
| `deliverables` | 候选、验证或拒绝的用户交付记录 | 属于 Task/Run | Task 删除时级联 |
| `deliverable_evidence` | Deliverable 到结构化输出、Artifact、ToolResult、Verification、Evaluation 的引用 | 属于 Deliverable | Deliverable 删除时级联 |

## 6. 状态与枚举字典

| 字段 | 允许值 |
| --- | --- |
| `agents.status` | `active`、`disabled` |
| `skills.status`、`tools.status` | `active`、`disabled` |
| `tasks.status` | `pending`、`running`、`succeeded`、`failed`、`cancelled` |
| `actions.status` | `pending`、`running`、`succeeded`、`failed`、`blocked`、`result_unknown`、`cancelled` |
| `tool_executions.status` | `running`、`succeeded`、`failed`、`blocked`、`result_unknown`、`cancelled` |
| `tool_executions.side_effect_state` | `none`、`not_started`、`confirmed`、`unknown` |
| `approvals.status` | `pending`、`approved`、`rejected`、`expired` |
| `approvals.risk_level` | `0` 自动执行、`1` 记录、`2` 人工确认、`3` 禁止或强制人工 |
| `permissions.effect` | `allow`、`deny` |
| `memories.owner_type` | `user`、`agent`、`company` |
| `memories.memory_type` | `preference`、`experience`、`fact`、`decision`、`pattern` |
| `knowledge_sources.source_type` | `local_file`、`seed_document` |
| `knowledge_sources.index_status` | `pending`、`indexed`、`failed`、`stale` |
| `agent_runs.phase` | `created`、`preflight`、`context_build`、`model_decision`、`waiting_user`、`authorize`、`waiting_approval`、`tool_execution`、`observe`、`validate_output`、`build_deliverable`、`evaluate`、`terminal` |
| `deliverables.status` | `candidate`、`verified`、`rejected` |
| `artifacts.verification_status` | `pending`、`verified`、`failed` |

`run_snapshots.snapshot_type` 允许 `agent | skill | capability_set | toolset | context | model`。历史显式单 Skill Run 保留 `skill`；聊天通用 Run 使用 `capability_set`，其 JSON 必须包含非空 `skills[]` 及每个 Skill 的版本、Manifest、Instructions 和 Hash。

Run phase 不增加或替代 Task/Action 状态。`waiting_user` 与 `waiting_approval` 时 Task 仍为 `running`；审批等待由 Action `blocked` 表达。表的完整 DDL 由追加 Migration `011_generic_agent_runs.sql` 实现。

状态转换由 Runtime 与 Security 领域定义；本模型只限制可持久化值，不允许任意字符串进入数据库。

## 7. 安全与数据治理

- 不在任何表中保存 API Key、Token、Cookie、私钥或明文凭证。
- `actions.input_json`、`actions.output_json`、`tool_executions.result_json`、`feedbacks.comment`、`memories.content` 和 `knowledge_chunks.content` 可能包含敏感信息，写入前必须执行最小化和脱敏。
- `audit_logs` 记录动作、资源和结果，不保存未经脱敏的完整输入输出。
- 数据保留期限尚未形成产品决策。实现时不得把“永久保存”作为默认承诺。
- 密钥管理属于独立安全设计；本模型不新增密钥值字段。

## 8. 冲突裁决

| 实体 | 旧定义冲突 | Canonical 决策 | 理由 |
| --- | --- | --- | --- |
| `agents` | 早期草稿缺少 `package_path` 和时间字段 | 保留 `package_path` 并补 `updated_at` | Agent Package 是运行时定位依据，可变实体需要更新时间 |
| `tasks` | 早期草稿缺少时间字段 | 补齐时间字段并含 `updated_at` | Task 状态变化必须可追踪 |
| `personas` | 只有 `updated_at`，缺少创建时间 | 补充 `created_at` | 可变从属实体保持统一时间基线 |
| `skills` | 路径字段与 manifest/status 表述不一 | 同时保留 `path`、`manifest_json`、`status` | 路径负责加载，manifest 负责声明，状态负责启停，职责不同 |
| `tools` | Tool Guide 使用包内 `manifest.yaml`，旧表只保存名称与版本 | 增加 `manifest_json` | 包文件是安装输入；校验、规范化后的数据库快照是运行时单一事实源 |
| `actions` | 早期草稿使用自由文本 `tool` | 改为可空外键 `tool_id` | 避免 Tool 名称漂移；无 Tool 的内部 Action 仍可记录 |
| Tool 幂等 | ToolCall 要求幂等键与多次尝试，但旧模型只有 Action | 增加 `tool_executions` | Action 表达计划步骤，Execution 表达每次真实调用及副作用状态，支持跨重启去重和人工核验 |
| `memories` | `owner` 对 `owner_type + owner_id` | 采用 `owner_type + owner_id` | 明确多主体归属 |
| `memories` | `type` 对 `memory_type` | 采用 `memory_type` | 避免通用字段名歧义 |
| `memories` | 只有 Memory Guide 包含置信度和时间 | 保留 `confidence`、`created_at`、`updated_at` | 支持检索排序、可信度和生命周期管理 |
| `approvals.risk_level` | 统一模型曾使用 1–5，Security 定义 0–3 | 采用 Security 的 0–3 | 保持自动执行、记录、确认、禁止四级语义一致 |
| `feedbacks.comment` | 统一模型曾强制非空，产品体验允许只评分 | 改为可空 | 区分未填写评论与实际文本 |
| Knowledge | MVP Tool 清单在 Browser 与 Knowledge 间冲突 | MVP 采用 Knowledge，Browser 延后到 Phase 2 | Golden Path 依赖本地资料检索，避免 MVP 引入网页抓取复杂度 |
| 多态引用 | `owner_id`、`subject_id` 无法使用单一外键 | MVP 由应用层验证，DB 层不保证 | 避免用触发器模拟跨表多态关系 |
| JSON 字段 | 文档把 `JSON` 当成 SQLite 类型 | 使用带 `json_valid()` 的 `TEXT` | 符合 SQLite 实际存储模型 |
| 时间字段 | `DATETIME` 与 `timestamp` 混用 | 统一 ISO 8601 UTC `TEXT` 和 `_at` 后缀 | 减少格式和时区歧义 |
| `metrics` | 没有主键，只有名称、值和时间 | 增加 `id` 及可空 Task、Agent 关联 | 支持唯一定位、追踪与聚合 |

## 9. 引用规则

- Memory、Skill、Tool、Security、Observability、Runtime Guide 负责解释各自生命周期和运行规则，不复制建表语句。
- Migration 只追加在 `storage/migrations/`，字段与约束必须依据本文档生成。
- Skill 和 Tool 的包内 manifest 只是安装输入。Loader 必须先按对应 JSON Schema 校验，再将规范化 JSON 写入 `manifest_json`；Task 开始后只能使用已锁定版本的数据库快照。
- 若未来实现与本文档冲突，先通过 ADR 记录变更，再同步本文档和 migration；不得直接在专题 Guide 中产生第二套 schema。
# Phase 1 多员工业务流扩展

多员工业务流复用 canonical `tasks`：一个 Root Task 表达编排生命周期，每个 WorkOrder 绑定一个 `parent_task_id=Root` 的 Child Task。`business_flows` 与 `work_orders` 不保存第二套状态；展示状态由 Root/Child Task、Action、Handoff 派生。

每个 Business Flow 必须绑定且只能绑定一个 `task_threads` 投影，Root Task 使用 `binding_role=root`，WorkOrder Child Task 使用 `binding_role=child`。一句话办事产生的绑定保留 `proposal_id`；场景库直接启动的高级 Runbook 没有 Task Proposal，`proposal_id` 为 `NULL`。场景库直接启动必须将 Flow、Root/Child Task、Task Thread、Goal 消息和全部 Binding 作为一个事务提交；工作库不得遗漏仍会参与 Employee 删除检查的活动 Business Flow。

Scenario Definition 的当前版本只指向不可变 `scenario_versions`。WorkOrder 记录员工、Capability、预算、验收与失败策略；依赖属于同一 Flow。Handoff 只能引用 verified Deliverable/Evidence，并将 `deliverable:<id>` 写入目标 Child 输入。`business_flow_outputs` 将 Root Task 映射到 Finalization verified Deliverable；Root 不创建 AgentRun。

`shared_context_refs` 只保存带 Hash、Sensitivity 和 allowed agents 的引用，不保存私人 Conversation、Employee Memory、Secret 或完整 ToolResult。

## Employee 物理删除与历史工作快照

`agents` 只表达当前可管理、可调度的员工。创建 Task 时，Runtime 必须在同一事务内写入 `task_participant_snapshots(task_id, historical_agent_id, display_name, role, captured_at)`。历史 Task Thread 的参与员工、消息、审批、交接和交付投影以该快照为身份事实，以 Task / Action / WorkOrder 为进度事实。

为保持既有历史表的外键完整性，Runtime 使用固定 ID `system:historical-employee` 的系统历史主体承接已删除员工的 Task、Approval、Evaluation、Scenario Node 与 WorkOrder 外键。`system:` 是 Runtime 保留命名空间，Employee CRUD 与 Agent Package 安装均不得创建该命名空间中的 ID。该主体无 Profile、Persona、Skill，永久 `disabled`，不是 Employee，不得出现在 `employees-list`、Task Proposal catalog、Capability readiness 或客户端通讯录中。原员工 `agents.id` 必须在删除事务结束后不存在。

Scenario Version 的 `definition_json` 与 `sha256` 始终不可变；`scenario_nodes.historical_agent_id` 保存版本确认时的原始员工 ID。员工删除时仅将可校验外键 `assignee_agent_id` 重绑定到系统历史主体，`historical_agent_id`、版本正文与 Hash 均不得改写。`audit_logs` 继续遵循追加写规则，员工删除只由数据库 `ON DELETE SET NULL` 清空其可空 `agent_id`，应用层不得把既有 Audit 改写到系统历史主体。
