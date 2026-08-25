# AI Employee OS MVP API & Interface Specification v1.0

## 归档接口补充

- `chat-retention --conversation-id --employee-id --operation archive|restore`：校验会话归属后变更 Conversation 状态。
- `archive-list --database`：只返回已归档私聊投影及最近消息摘要，不复制消息或 Task 数据。
- `chat-delete`：归档页确认后永久删除私聊 Conversation；仍须校验员工所有权。
- Task Thread 继续使用 `task-thread-list --archived` 与 `task-thread-retention restore|delete`。客户端统一展示不改变两类对象的删除语义。

> 实现状态（对齐 ADR-032）：进程间传输为 **CLI / 子进程 JSON**，不是 gRPC。新工作执行使用 Rust Generic Run Kernel + Python `task_worker`；Golden Path 仅为迁移期兼容入口。Deep Agents / LangGraph 不是状态源；以 Runtime CLI 与 `contracts/` 为准。
>
> 2026-08-06 扩展：新增 `run-skill`、`run-status`、`continue-run` 与 `capability-readiness`。Python 只返回 `ask_user | tool_call | complete`，安全字段由 Rust 生成；授权后仍只经 Rust ToolExecutor 执行。普通对话仍不创建 Task；工作聊天将在迁移阶段切换到 Generic Run Kernel。

目标：

定义各模块之间的通信协议，使：

- Swift macOS Client
    
- Rust Runtime Kernel
    
- Python Agent Worker
    
- Skill Runtime
    
- Tool Runtime
    
- Memory System
    

可以独立开发并稳定协作。

---

# 1. Interface Architecture Overview

整体通信：

```text
                Swift macOS App


                      |

              CLI / 子进程 JSON


                      |

              Rust Runtime Core


        ┌─────────────┼─────────────┐

        |             |             |

 employees/chat   run-task     ToolExecutor


                      |

                Python Worker


                      |

        意图 / 闲聊 / Context / LLM Provider


                      |

        ┌─────────────┼─────────────┐

        |             |             |

   Skill Graph   Memory API   LLM API

```

Conversation 所有权是 Runtime 强制隔离边界：`chat-history`、`chat-send`、`chat-abort`、`chat-delete` 均必须同时提交 `conversation_id` 与 `employee_id`。已有 Conversation 的 `agent_id` 与请求员工不一致时，Runtime 必须以 `conversation_employee_mismatch` 拒绝；不得读取、追加、中止或删除其他员工的会话。Conversation 尚不存在时，仅 `chat-send` 可为当前员工创建该会话。

---

# 2. Service Boundary

## Swift Client

职责：

用户交互层。

调用：

- Runtime CLI（员工、对话、任务、事件）
    
- 本地 Store / Keychain
    

不直接访问：

❌ LLM  
❌ Skill 执行  
❌ Tool 执行

---

## Rust Runtime

职责：

系统控制层。

负责：

- 生命周期
    
- 权限 / 审批 / 审计
    
- Task / Action 调度
    
- 状态与 SQLite
    
- Tool Gateway
    
- 子进程 IPC
    

---

## Python Agent Worker

职责：

智能执行层。

负责：

- 意图分类与闲聊
    
- Context Engineering
    
- 规划推理（不直接取得系统权限）
    
- LLM Provider 调用
    

---

# 3. 接口语义草稿（非 gRPC 传输）

> 下列 message / service 名称描述字段语义。实际调用形态为 Runtime CLI 子命令与 JSON stdin/stdout；禁止实现独立 gRPC server。

## 3.1 Agent Service

负责：

AI员工管理。

语义草稿：

```protobuf
service AgentService {


 rpc ListAgents(
    Empty
 )
 returns(
    AgentList
 );


 rpc GetAgent(
    AgentRequest
 )
 returns(
    Agent
 );


 rpc InstallAgent(
    AgentPackage
 )
 returns(
    Agent
 );


 rpc UpdateAgent(
    AgentUpdate
 )
 returns(
    Agent
 );

}
```

---

## Agent Object

```protobuf
message Agent {


 string id = 1;


 string name = 2;


 string role = 3;


 string version = 4;


 string status = 5;


 Persona persona = 6;


 repeated Skill skills = 7;


 repeated Tool tools = 8;


}

```

---

返回：

```json
{
"id":
"product_manager_001",

"name":
"示例员工",

"role":
"AI Product Manager",

"status":
"ready",

"skills":[
"prd",
"research"
]

}

```

---

# 4. Task Service

核心任务接口。

---

## Create Task

```protobuf
service TaskService {


rpc CreateTask(

 TaskRequest

)

returns(

 TaskResponse

);


rpc GetTask(

 TaskID

)

returns(

 Task

);


rpc CancelTask(

 TaskID

)

returns(

 Status

);

}

```

---

Task Request：

```protobuf
message TaskRequest {


string agent_id = 1;


string message = 2;


map<string,string> context = 3;


}

```

---

示例：

用户：

```text
@AI产品经理

分析企业AI知识库需求

```

转换：

```json
{
"agent_id":
"product_manager_001",

"message":
"分析企业AI知识库需求"

}

```

---

# 5. Agent Event Stream

用于实时展示 AI 工作状态。

协议：

SSE。

事件：

---

## Task Started

```json
{
type:
"task_started",

agent:
"示例员工",

task:
"需求分析"

}

```

---

## Planning

```json
{
type:
"planning",

steps:[

"读取资料",

"分析需求",

"生成PRD"

]

}

```

---

## Tool Calling

```json
{
type:
"tool_call",

tool:
"file-tool",

action:
"read_file"

}

```

---

## Completed

```json
{
type:
"task_completed",

result:
"prd.md"

}

```

---

# 6. Agent Worker API

Rust → Python

---

## Execute Task

```protobuf
service AgentWorker {


rpc ExecuteTask(

TaskExecution

)

returns(

stream AgentEvent

);


}

```

---

TaskExecution：

```json
{
agent_id:
"product_manager",

task_id:
"task_001",

context:

{

identity:{},

persona:{},

skills:[],

memory:[],

knowledge:[]

}

}

```

---

# 7. Context Engine Interface

Python内部。

接口：

```python
class ContextBuilder:


    def build(
        task,
        agent,
        memory,
        knowledge,
        skills,
        tools
    ):

        return Context

```

---

输入：

```json
{

task:
"生成PRD",

agent:
"示例员工",

skills:
[
"prd-generation"
],

memory:
[
"user_pref"
]

}

```

---

输出：

```json
{

system_prompt:

"你是AI产品经理示例员工...",


available_tools:

[
"file-tool"
]


}

```

---

# 8. Skill Runtime API

## Skill Loader

```python
class SkillLoader:


    def load(
        package_path
    ):

        return Skill


```

---

## Skill Object

```json
{

id:
"prd-generation",

version:
"1.0.0",

trigger:

[
"product_design"
],


required_tools:

[
"document-tool"
]

}

```

---

## Skill Execute

```python
class SkillExecutor:


    def execute(

        skill,

        context

    ):

        return result

```

---

# 9. Tool Runtime API

## Tool Interface

所有 Tool 必须实现：

```python
class Tool:


    name:str


    description:str


    execute(
        input
    ):


        result

```

---

# File Tool

```python
class FileTool:


    def read_file(path):

        pass


    def write_file(
        path,
        content
    ):

        pass

```

---

# Document Tool

```python
class DocumentTool:


    def create(

        title,

        content,

        format

    ):

        pass

```

---

# Knowledge Tool

```python
class KnowledgeTool:


    def search(

        query,

        top_k

    ):

        pass


    def get_source(source_id):

        pass

```

Knowledge Tool 只检索本地资料和 `knowledge/seed` 预置内容。Browser Tool 不进入 MVP，计划在 Phase 2 通过 MCP 接入。

---

# Tool Request Schema

```json
{

tool:

"file-tool",


action:

"read_file",


params:

{

"path":
"/product/prd.md"

}

}

```

---

# Tool Response

```json
{

status:
"success",


data:

{

content:
"..."

}

}

```

---

# 10. Memory API

## Store Memory

```python
class MemoryStore:


    def save(

        owner,

        type,

        content,

        importance

    ):

        pass

```

---

Example：

```json
{

owner:
"product_manager",


type:
"experience",


content:

"PRD需要包含ROI分析",


importance:
0.9

}

```

---

## Retrieve Memory

```python
class MemoryRetriever:


    def search(

        query,

        top_k

    ):

        return memories

```

---

# 11. Evaluation API

## Evaluate Task

```python
class Evaluator:


    def evaluate(

        task,

        result

    ):

        return score

```

---

输出：

```json
{

task:
"prd_generation",


score:

0.92,


metrics:

{

completeness:
0.9,

clarity:
0.95

}

}

```

---

# 12. LLM Provider API

统一模型接口。

```python
class LLMProvider:


    def chat(

        messages,

        tools

    ):


        response



    def embedding(

        text

    ):


        vector

```

---

Provider：

```text
providers/


openai.py

deepseek.py

claude.py

poe.py

```

MVP 路由决策：

- 模型源：客户端从项目根目录 `.env` 的 `AI_EMPLOYEE_MODELS` 枚举可选 Provider/Model；API Key 不进入客户端界面，仅在模型调用执行边界读取对应的 `POE_API_KEY` 或 `DEEPSEEK_API_KEY` 并注入受控进程。
- 兜底模型源：Poe API。
- 只有网络不可达、限流、服务端临时错误或依赖不可用允许按有界策略切换。
- 认证失败、余额或配额问题、非法请求、内容策略拒绝、响应 Schema 错误不得静默切换。
- Provider 切换必须记录脱敏 Trace、错误分类和 Metrics，不得记录 API Key、Token 或原始敏感输入。

---

# 13. Agent Package Schema

最终标准：

```yaml
agent:

id:
example-employee


version:
1.0.0


identity:

name:
示例员工

role:
Product Manager


persona:

path:
persona.yaml


skills:

- prd-generation


tools:

- file-tool


memory:

enabled:true


evaluation:

enabled:true

```

---

# 14. Skill Package Schema

```yaml
skill:


id:
prd-generation


version:
1.0.0


trigger:

- product_design


tools:

- document-tool


output:

document

```

---

# 15. Tool Package Schema

```yaml
tool:


id:
file-tool


version:
1.0.0


type:
native


permissions:

- filesystem.read

- filesystem.write

```

---

# 16. API 调用完整链路

用户：

```text
@AI产品经理

分析这个需求
```

---

流程：

```text

Swift UI

↓

chat-send / run-task（Runtime CLI）

↓

Rust Task Manager / ToolExecutor

↓

Python Worker（意图 / Context / 规划）

↓

Skill Graph（golden_path）

↓

Tool Runtime（仅经 Rust）

↓

LLM Provider

↓

Result / Event Stream

↓

Swift UI

```

---

# 16.1 Canonical Tool Runtime Interface

本节替代第 9 节的简化 `tool/action/params` 请求和 `status/data` 响应。Tool manifest 和完整规则以 [[AI Employee OS Tool Runtime Engineering Guide v1.0#22. Tool 机器可读契约（Canonical）]] 为准。

## ToolCall

```json
{
  "call_id": "call_01J...",
  "task_id": "task_01J...",
  "action_id": "action_01J...",
  "agent_id": "agent_product_manager",
  "tool_id": "file-tool",
  "tool_version": "1.0.0",
  "action": "read_file",
  "arguments": {"path": "/product/prd.md"},
  "idempotency_key": "task_01J:action_01J:1",
  "permission_context": {"grant_ids": ["grant_product_docs_read"]},
  "approval_id": null,
  "deadline": "2026-08-04T10:00:10Z",
  "trace_id": "trace_01J...",
  "attempt": 1
}
```

## ToolResult

```json
{
  "call_id": "call_01J...",
  "status": "succeeded",
  "output": {"content": "..."},
  "error": null,
  "side_effect_state": "none",
  "verification": null,
  "artifacts": [],
  "result_ref": null,
  "started_at": "2026-08-04T10:00:00Z",
  "finished_at": "2026-08-04T10:00:01Z",
  "duration_ms": 1000,
  "trace_id": "trace_01J..."
}
```

公共类型冻结：

- `ToolResult.status`: `succeeded | failed | blocked | result_unknown`
- `side_effect_state`: `none | not_started | confirmed | unknown`
- `ToolError.code`: `INVALID_ARGUMENT | TOOL_NOT_FOUND | ACTION_NOT_FOUND | VERSION_MISMATCH | PERMISSION_DENIED | APPROVAL_REQUIRED | APPROVAL_REJECTED | TIMEOUT | RATE_LIMITED | DEPENDENCY_UNAVAILABLE | EXECUTION_FAILED | OUTPUT_SCHEMA_INVALID | RESULT_UNKNOWN | CANCELLED`
- `ToolError` 必须包含 `code`、`message`、`retryable`；`details` 可选且必须脱敏。

执行语义：

- 所有调用收敛到唯一 ToolExecutor，禁止 Skill、Agent Worker、Workflow 或 MCP Adapter 直接执行 Tool。
- ToolExecutor 必须先验证版本和 `arguments`，再检查权限与 Approval；执行后先核验副作用，再验证 `output_schema`。
- 同一 `idempotency_key` 不得重复产生副作用。`result_unknown` 不得自动重放。
- `output` 仅在符合 Action `output_schema` 后才能写入 `actions.output_json`。

# 16.2 Canonical Skill Runtime Interface

第 8 节的简化 Skill Object 只作领域说明。机器可读 manifest、触发、Context、Tool 依赖、Workflow 和 Evaluation 契约以 [[AI Employee OS Skill Engineering Guide v1.0#22. Skill 机器可读契约（Canonical）]] 为准。

显式 SkillExecutor 的输入必须包含锁定的 `skill_id`、`skill_version`、`task_id`、符合 Skill `input_schema` 的 `input`、`context_snapshot_id`、`toolset_snapshot_id`、`trace_id`。聊天通用 Agent Run 改为包含非空 `capability_set`；每次 `tool_call` 必须携带集合内的 `skill_id`，Rust 校验该 Skill 声明的 Tool/Action。显式单 Skill 输出继续符合 Skill `output_schema`；通用 Agent Run 输出使用 Task 级结果对象，并以 Artifact、ToolResult 与 Evaluation 验证交付。

# 16.3 契约文件与校验门禁

实现时必须从本接口冻结产出：

```text
contracts/
├── tool-manifest.schema.json
├── skill-manifest.schema.json
├── tool-call.schema.json
├── tool-result.schema.json
├── examples/
└── fixtures/
```

CI 必须校验正例通过、反例失败、Skill 引用的 Tool/Action/版本存在、Step Schema 可对接、权限覆盖、审批与重试规则一致。未知 `schema_version` 必须 fail closed。

# 17. MVP Interface Freeze

第一阶段冻结接口：

## 必须稳定

- Agent API
    
- Task API
    
- Tool Interface
    
- Skill Manifest
    
- Memory API
    
- Event Schema
    

---

## 可变化

- UI
    
- Prompt
    
- Skill内容
    
- Model Provider
    

---

# 18. 开发原则

## Rust 不知道 AI

Rust：

只知道：

- Task
    
- Permission
    
- Tool
    
- State
    

---

## Python 不控制系统

Python：

不能：

- 直接访问文件
    
- 直接执行系统命令
    

必须：

通过：

```text
Python Agent

↓

Rust Tool Gateway

↓

System

```

---

## Swift 不参与推理

Swift：

只负责：

- 展示
    
- 输入
    
- 用户授权
    

---

# 当前文档状态

现行入口：

1. [架构总览](./架构总览.md)
2. Unified Data Model + `contracts/`
3. 本文档（CLI / 子进程语义；Proto 块为历史草稿）
4. ADR（含 ADR-027～031）
5. AI Product Manager Agent 规范（主路径 示例员工 + `prd-generation`）
    
# Phase 1 Scenario / Business Flow CLI

Runtime 新增 `scenario-list|get|propose|validate|save|disable` 与 `business-flow-plan|start|list|status|continue`。`scenario-propose` 只返回未持久化草案；`scenario-save` 必须显式 `--confirmed`。Plan 无写入，Start 必须携带不可变版本 Hash；同 Flow ID/Hash 幂等，不同 Hash 返回 `flow_revision_conflict`。场景库直接 Start 必须在创建 Business Flow 的同一事务内创建唯一 Task Thread、Goal 消息及 Root/Child Binding，禁止提交工作库不可见的孤立 Flow；`recover-runtime` 仍须幂等补齐旧版本遗留的未绑定 Flow，并返回 `flow_threads_repaired`。

Root 取消继续使用 `cancel-task`；Child 审批、用户输入和 `result_unknown` 继续使用现有 `continue-run`、`resolve-action-result`。所有 stdout 响应为 JSON，诊断写 stderr。

# Unified Task Entry CLI

办公室统一入口使用以下窄命令，Swift 不创建 Task、Run、Action、WorkOrder 或权限事实：

- `task-thread-create --title --objective`
- `task-thread-list`
- `task-thread-get --thread-id`
- `task-thread-message --thread-id --input`
- `task-proposal-generate --thread-id [--preferred-agent-id]`
- `task-proposal-confirm --proposal-id --proposal-hash`

`task-proposal-generate` 调用 Python 提案 Worker，但由 Rust 校验 Schema、员工状态、Skill readiness、预算与分工；返回值永远需要用户确认。`task-proposal-confirm` 重新校验 Hash、15 分钟有效期与实时 readiness：单员工进入 Generic Run Kernel；多员工生成 Root/Child Task、WorkOrder 与依赖，并复用 Business Flow Kernel。重复确认同一已物化 Proposal 返回同一 Task Thread 投影。

员工生命周期使用三个独立 CLI 语义：

- `employee-set-status --employee-id --status active|disabled`：幂等启用或禁用，不修改 Profile 内容。只有 `active` 且存在 ready Skill 的员工可以进入 Task Proposal catalog。Flow 启动后停用员工时，已经取得 AgentRun 的 Child 继续使用锁定快照；尚未启动的 Child 不得取得 AgentRun，WorkOrder 投影为 `waiting_user` 并产生幂等 `assignee_unavailable` 事件，恢复前需要重新启用或完成受控重分配。
- `employee-delete-check --employee-id`：只读返回 `deletable`、`active_work_count` 与稳定 `reason`；不写数据库。
- `employee-delete --employee-id`：在 `BEGIN IMMEDIATE` 事务内重新检查活动 Task。存在 `pending | running` Task 时以 `employee_delete_blocked_active_work` 拒绝且不得产生部分删除；否则物理删除 Employee 私有状态，保留终态工作及 `task_participant_snapshots`。

`employee-delete` 不得自动降级为 `disabled`。删除成功后返回 `disposition: deleted`；删除是不可逆操作，不增加 `deleted` Employee 状态。
