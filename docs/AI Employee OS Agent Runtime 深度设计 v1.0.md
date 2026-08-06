# AI Employee OS Agent Runtime 深度设计 v1.0

> 实现状态（对齐 ADR-032）：新主链为 Rust Generic Run Kernel + Python bounded decision worker，经 `run-skill` 与 Rust `ToolExecutor`；Golden Path 仅作迁移期兼容。Deep Agents / LangGraph 不得成为 Task/Action/Run 状态源。

目标：

定义 AI 员工“大脑”的运行机制。

重点解决：

- Agent 如何理解任务
    
- Context 如何动态组装
    
- MVP Graph / Golden Path 如何编排工作
    
- Planner / Executor / Reviewer 如何协作（领域语义）
    
- Tool 如何经 Rust 调用
    
- Memory 如何沉淀（Runtime 基础设施；产品面未全暴露）
    

---

# 1. Agent Runtime 定位

Agent Runtime 是 AI Employee OS 的智能执行引擎。

它负责：

```text
用户任务

↓

理解

↓

规划

↓

执行

↓

观察

↓

反思

↓

完成

↓

学习

```

---

整体：

```text
                Agent Runtime


                 Task Input


                     |

             Context Engineering


                     |

              Agent Controller


                     |

        ┌────────────┼────────────┐

        |            |            |

     Planner     Executor    Reviewer


        |            |            |

        └────────────┼────────────┘


                     |

              Memory Update


```

---

# 2. Agent Runtime 分层

```text

Agent Runtime


├── Task Layer

│
├── Context Layer

│
├── Reasoning Layer

│
├── Action Layer

│
├── Observation Layer

│
├── Reflection Layer

│
└── Learning Layer

```

---

# 3. Task Layer

负责：

接收用户目标。

例如：

输入：

```
@AI产品经理

帮我分析企业AI知识库需求
```

转换：

```json
{
task_id:
"task_001",

agent_id:
"product_manager",

goal:
"分析企业AI知识库需求",

priority:
"normal"

}

```

---

# 4. Context Engineering Pipeline

这是整个系统核心。

传统：

```text
User Prompt

↓

LLM

↓

Answer

```

AI Employee：

```text

Task

↓

Context Planner

↓

Context Retrieval


├── Identity

├── Persona

├── Skill

├── Memory

├── Knowledge

├── Tool

└── Constraints


↓

Context Builder

↓

LLM

```

---

# 5. Context Planner

职责：

决定：

> 当前任务需要什么上下文。

例如：

任务：

```
生成PRD
```

判断：

需要：

```json
{
need:

[
"prd_skill",

"product_docs",

"user_preference",

"document_tool"

]

}

```

---

不需要：

```text
销售Skill

财务知识

```

---

# 6. Context Components

## 6.1 Identity Context

来源：

Agent Package。

例如：

```text
你是 Alex。

岗位：

AI产品经理。

目标：

帮助用户完成产品分析。

```

---

## 6.2 Persona Context

来源：

persona.yaml

例如：

```text
工作方式：

结构化分析

数据驱动

先结论后展开

```

---

## 6.3 Skill Context

来源：

Skill Runtime。

例如：

加载：

```text
prd-generation

```

提供：

```text
PRD结构：

背景

问题

方案

指标

验收标准

```

---

## 6.4 Memory Context

查询：

FastEmbed。

任务：

```
生成PRD
```

检索：

```text

用户偏好：

喜欢商业价值分析。


历史经验：

PRD必须包含ROI。


```

---

## 6.5 Knowledge Context

来自：

本地知识库。

例如：

```text

产品定位：

AI Employee OS

目标用户：

企业团队

```

---

## 6.6 Tool Context

告诉 Agent：

当前可用工具：

```text

File Tool

Document Tool

Knowledge Tool

```

---

# 7. Context Builder

最终生成：

```xml

<identity>

你是AI产品经理Alex

</identity>


<persona>

结构化、数据驱动

</persona>


<skills>

PRD生成方法

</skills>


<memory>

用户偏好

</memory>


<knowledge>

产品资料

</knowledge>


<tools>

Document Tool

</tools>


<task>

生成PRD

</task>

```

---

# 8. Deep Agents Integration

架构：

```text

AI Employee Runtime


          |

    Employee Adapter


          |

    Deep Agents


          |

    LangGraph


          |

    LLM

```

---

不要直接暴露 Deep Agent。

增加 Adapter：

```python
class EmployeeAgent:


    def execute(task):

        context = context_builder.build(
            task
        )


        result = deep_agent.invoke(
            context
        )


        return result

```

---

# 9. LangGraph State Graph 设计

Agent Loop：

定义为 Graph。

```text

START

 |

 |

Context_Load

 |

 |

Plan

 |

 |

Execute

 |

 |

Observe

 |

 |

Reflect

 |

 +------------+

 |            |

Done       Continue

 |            |

END       Execute

```

---

# 10. State Schema

LangGraph State：

```python
class AgentState(TypedDict):


    task_id:str


    goal:str


    plan:list


    current_step:int


    actions:list


    observations:list


    result:str


    should_continue:bool

```

---

# 11. Planner Node

职责：

生成执行计划。

输入：

```text
目标：

分析企业AI知识库需求

```

输出：

```json
[
{
step:1,

action:
"读取产品资料"

},

{
step:2,

action:
"分析竞品"

},

{
step:3,

action:
"生成需求文档"

}

]

```

---

Planner 不执行。

只规划。

---

# 12. Executor Node

负责：

执行计划。

判断：

需要什么 Action。

例如：

计划：

读取产品资料。

调用：

```text
File Tool

```

---

流程：

```text

Executor

↓

Tool Selection

↓

Permission Check

↓

Tool Call

↓

Result

↓

State Update

```

---

# 13. Tool Calling

完整链路：

```text

Agent

↓

Tool Request

↓

Rust Tool Gateway

↓

Permission

↓

Tool Execute

↓

Return Result

↓

Agent Observation


```

---

示例：

Agent：

```json
{
tool:
"file-tool",

action:
"read_file",

path:
"/product/info.md"

}

```

---

Rust：

检查：

```text
AI产品经理

允许读取产品目录

```

---

返回：

```json
{
content:
"产品介绍..."

}

```

---

# 14. Observation Node

职责：

理解工具结果。

例如：

File Tool 返回：

```
产品资料缺少竞品信息
```

Observation：

生成：

```text
发现：

需要补充竞品分析

```

---

# 15. Reflection Node

核心：

判断：

是否完成。

---

输入：

```text
当前结果

目标

评价标准

```

输出：

```json
{

done:false,


reason:

"缺少竞品数据"


next_action:

"调用Knowledge Tool检索预置竞品资料"

}

```

---

# 16. Reviewer Node

任务结束前：

检查质量。

例如 PRD：

检查：

```text
是否包含：

✓ 背景

✓ 用户问题

✓ 功能

✓ 指标

✓ 验收标准

```

---

输出：

```json
{
score:
0.9,

pass:
true

}

```

---

# 17. Agent Loop Controller

防止无限循环。

配置：

```yaml
loop:

max_iterations:
10


max_tool_calls:
20


timeout:
30min

```

---

# 18. Memory Extraction Pipeline

任务完成：

不是直接保存。

流程：

```text

Result

↓

Evaluation

↓

Memory Extractor

↓

Candidate

↓

Importance Score

↓

Save

```

---

# 19. Memory Extractor

判断：

值得长期记忆吗？

例如：

用户：

"以后PRD需要商业价值分析"

输出：

```json
{
type:
"user_preference",

importance:
0.95

}

```

---

# 20. Agent Runtime 完整流程

最终：

```text

User


↓

Task Router


↓

Context Builder


↓

Deep Agent


↓

Planner


↓

Executor


↓

Tool


↓

Observation


↓

Reflection


↓

Reviewer


↓

Result


↓

Evaluation


↓

Memory


```

---

# 21. AI产品经理 Demo 完整 Trace

用户：

```
@Alex
帮我分析企业AI知识库需求
```

---

Trace：

```
10:00 Task Created

10:01 Context Loaded

10:02 Planning

10:03 Read Product Docs

10:04 Knowledge Retrieval

10:06 Competitor Analysis

10:08 Generate PRD

10:09 Review

10:10 Completed

```

---

# 22. MVP Agent Runtime 验收

必须满足：

## Context

✅ 动态加载 Persona  
✅ 动态加载 Skill  
✅ 动态检索 Memory

## Execution

✅ Plan  
✅ Tool Call  
✅ Observation  
✅ Reflection

## Learning

✅ Evaluation  
✅ Memory Update

---

# 23. Task / Action 状态机（Canonical）

数据库只限制可持久化枚举，本节定义 Runtime 允许的转换。未列出的转换一律拒绝并写入 Audit Log。

## 23.1 Task 状态转换

| 当前状态 | 事件/条件 | 下一状态 | 必须执行的副作用 |
| --- | --- | --- | --- |
| `pending` | Runtime 成功锁定 Agent、Skill、Toolset 和 Context 快照 | `running` | 记录 `TaskStarted` |
| `pending` | 用户取消 | `cancelled` | 不启动任何 Action |
| `running` | 完成条件满足且必需 Action 全部成功 | `succeeded` | 持久化结果和完成事件 |
| `running` | 不可恢复错误或审批被拒绝/过期 | `failed` | 持久化结构化失败原因 |
| `running` | 用户取消 | `cancelled` | 停止启动新 Action，向运行中 Action 发送取消信号 |

Task 没有 `blocked` 状态。审批期间 Task 保持 `running`，由具体 Action 的 `blocked` 状态表达阻断；Runtime 不得在此期间运行依赖该 Action 的后续 Step。

## 23.2 Action 状态转换

| 当前状态 | 事件/条件 | 下一状态 | 必须执行的副作用 |
| --- | --- | --- | --- |
| `pending` | 需要 Approval 且尚未通过 | `blocked` | 创建唯一 `approvals` 记录，保存待执行参数摘要 |
| `pending` | 输入、权限和审批检查通过 | `running` | 锁定 Tool 版本和幂等键 |
| `pending` | Task 取消 | `cancelled` | 不调用 Tool |
| `blocked` | Approval 通过且未过期 | `pending` | 复用原 `action_id`、参数、Tool 版本和 `idempotency_key` 重新入队 |
| `blocked` | Approval 拒绝或过期 | `failed` | 写入 `APPROVAL_REJECTED` 或 `APPROVAL_EXPIRED`，不调用 Tool |
| `blocked` | Task 取消 | `cancelled` | 关闭待审批项，不调用 Tool |
| `running` | ToolResult 为 `succeeded` 且输出校验通过 | `succeeded` | 持久化脱敏输出和验证证据 |
| `running` | 确认失败且重试用尽/不允许重试 | `failed` | 持久化结构化错误 |
| `running` | ToolResult 为 `result_unknown` | `result_unknown` | 停止自动继续和重试，创建人工核验事件 |
| `running` | Task 取消且 Tool 确认未产生副作用 | `cancelled` | 记录取消结果 |
| `result_unknown` | 人工核验确认副作用已成功 | `succeeded` | 保存外部证据，不再调用 Tool |
| `result_unknown` | 人工核验确认未成功或不可恢复 | `failed` | 保存核验证据，不自动重放 |

`result_unknown` 是需要人工收敛的非终态，不得转回 `pending` 或 `running`。核验后只能将同一 Action 收敛为 `succeeded` 或 `failed`。

## 23.3 Approval 状态转换

| 当前状态 | 事件 | 下一状态 | 约束 |
| --- | --- | --- | --- |
| `pending` | 授权人同意 | `approved` | 必须在过期时间前，且参数摘要未改变 |
| `pending` | 授权人拒绝 | `rejected` | 终态，不可复用 |
| `pending` | 超过有效期 | `expired` | 终态，如仍需执行则创建新 Approval |

Approval 决定必须使用 compare-and-set 从 `pending` 转换，避免重复审批和并发覆盖。审批通过后若 Tool、Action、参数、权限或风险等级发生变化，原 Approval 失效，必须重新请求。

## 23.4 恢复与幂等验收

必须覆盖：审批通过后 `blocked → pending → running`；拒绝、过期和 Task 取消；重复 Approval 回调；Runtime 在创建 Approval 前后崩溃；通过后重启；同一幂等键重复入队；`result_unknown` 禁止自动重放；取消与 Tool 完成并发时只产生一个合法终态。

# 当前 Agent Runtime 版本

```text
AI Employee OS Agent Runtime v1.0


Deep Agents

+

LangGraph

+

Custom Context Engineering

+

Custom Memory

+

Custom Skill Runtime

+

Custom Tool Runtime

```
