
# AI Employee OS MVP 技术详细设计（LLD）v1.0

目标：

把上一份架构设计转换成开发团队可以执行的技术规格。

---

# 1. MVP 技术目标

## 1.1 核心验证

验证：

> 多个 AI 员工是否可以在 macOS 环境中独立完成真实工作闭环。

第一阶段只实现：

- AI 产品经理 Agent
    
- AI 运营 Agent（备用）
    
- AI 研究 Agent（备用）
    

不实现：

- Multi-Agent 协作
    
- Computer Use
    
- 云同步
    
- Marketplace
    

---

# 2. MVP 系统架构

```text
                    macOS App


                  SwiftUI Client


                        |

                   gRPC / IPC


                        |

              Rust Runtime Core


        ┌───────────────┼───────────────┐

        |               |               |

   Task Manager    Tool Gateway   Storage API


                        |

                   Python Worker


                        |

              Deep Agents Runtime


                        |

                  LangGraph


                        |

        ┌───────────────┼───────────────┐

        |               |               |

     Skills         Memory          LLM Adapter


                        |

              OpenAI Compatible API


                        |

          GPT / Claude / DeepSeek

```

---

# 3. 进程设计

MVP 三进程：

---

## Process 1：AIEmployee.app

技术：

SwiftUI

职责：

- UI
    
- 用户输入
    
- 展示状态
    
- 权限请求
    

不负责：

❌ Agent逻辑  
❌ LLM调用  
❌ Skill执行

---

## Process 2：AIEmployee.Runtime

技术：

Rust

职责：

系统核心。

模块：

```text
runtime/

├── task_manager

├── agent_manager

├── tool_gateway

├── permission

├── storage

└── event_bus

```

---

## Process 3：Agent Worker

技术：

Python

职责：

智能执行。

模块：

```text
agent/

├── context_engine

├── planner

├── executor

├── memory

├── skills

└── providers

```

---

# 4. 通信设计

## 4.1 Swift → Rust

采用：

gRPC。

接口：

```protobuf
service AgentService {


 rpc CreateTask(CreateTaskRequest)
 returns(TaskResponse);


 rpc GetTask(TaskRequest)
 returns(Task);


 rpc CancelTask(TaskRequest)
 returns(Status);

}

```

---

请求：

```json
{
"agent_id":
"product_manager",

"message":
"分析这个需求"
}

```

返回：

```json
{
"task_id":
"task_001",

"status":
"running"
}

```

---

# 4.2 Rust → Python

gRPC。

接口：

```protobuf
service AgentWorker {


rpc ExecuteTask(Task)

returns(stream AgentEvent);


}

```

---

事件：

```json
{
"type":
"tool_call",

"tool":
"file_reader",

"status":
"running"
}

```

---

# 4.3 Rust → Swift

实时：

SSE。

事件：

```json
{
event:
"agent_progress",

data:

{
agent:
"Alex",

message:
"正在分析需求"
}

}

```

---

# 5. 数据库设计

## SQLite

数据库：

```
employee.db
```

完整的实体关系、字段、约束、索引和 SQLite DDL 统一见 [[AI Employee OS Unified Data Model v1.0]]。

本 LLD 只保留领域职责：

- Agent 与 Persona 定义员工身份和行为配置。
- Skill 通过 Agent Skill 关系分配给员工。
- Task 包含多个 Action，并记录执行状态。
- Memory 保存用户、Agent 或公司的长期记忆。
- Action 可关联 Tool，并为运行时与审计提供执行轨迹。

---

# 6. FastEmbed设计

目录：

```
vector_store/

├── user_memory/

├── agent_memory/

└── knowledge/

```

---

Embedding流程：

```text
Document

↓

Chunk Split

↓

FastEmbed

↓

Vector Index

↓

Retrieval

```

---

# 7. Agent Runtime设计

## Agent生命周期

```text
Created

↓

Loaded

↓

Ready

↓

Working

↓

Waiting

↓

Completed

↓

Archived

```

---

# 8. Context Engine设计

核心：

Dynamic Context Builder。

输入：

```json
{

task:

"生成PRD",


agent:

"AI产品经理",


skills:

[],


memory:

[],


knowledge:

[]


}

```

---

输出：

```text
SYSTEM

你是AI产品经理Alex


PERSONA

结构化、数据驱动


SKILL

PRD Generation


MEMORY

用户喜欢商业价值分析


TASK

生成PRD

```

---

# 9. Deep Agents Integration

封装：

```python
class EmployeeAgent:


    def run(task):

        context = build_context()

        result = deep_agent.invoke(
            context
        )

        return result

```

---

# 10. Skill Runtime设计

Skill加载：

```text
skills/


prd-generation/

├── SKILL.md

├── references/

├── scripts/

└── tests/

```

---

SKILL.md:

```yaml
name:
prd-generation


trigger:

product_requirement


tools:

- document-tool


output:

prd_document

```

---

# 11. Tool Runtime设计

MVP:

三个 Tool。

---

## File Tool

接口：

```python
read_file(path)

write_file(path,data)

search_file(query)

```

---

## Knowledge Tool

接口：

```python
search_knowledge(query, top_k)

get_knowledge_source(source_id)

```

---

## Document Tool

接口：

```python
create_markdown()

create_docx()

```

---

# 12. Agent State设计

使用：

Deep Agents Checkpoint。

保存：

```text
task_id

thread_id

current_node

checkpoint

state

```

---

# 13. Memory流程

任务结束：

```text
Result

↓

Evaluation

↓

Memory Extractor

↓

Memory Candidate

↓

SQLite

↓

FastEmbed

```

---

# 14. MVP 第一个 Agent

## AI Product Manager

Package:

```
agents/

ai-product-manager/

```

---

结构：

```
ai-product-manager/

├── AGENT.md

├── manifest.yaml

├── persona/

├── skills/

│
├── prd-generation/

├── competitor-analysis/

└── knowledge/

```

---

# 15. AI Product Manager Golden Demo

用户：

```
@AI产品经理

帮我分析企业AI知识库需求
```

---

系统：

## Step 1

识别 Agent：

```text
product_manager
```

---

## Step 2

加载：

Identity:

AI产品经理

Persona:

结构化

Skill:

需求分析

Memory:

历史PRD偏好

---

## Step 3

执行：

Deep Agent Loop：

```
Plan

↓

读取资料

↓

分析

↓

生成PRD

↓

Review

```

---

## Step 4

输出：

```
AI知识库PRD.md

```

---

## Step 5

保存：

```
Task History

Memory

Evaluation

```

---

# 16. MVP 开发 Sprint

## Sprint 1（2周）

基础骨架：

完成：

- Swift App
    
- Rust Runtime
    
- Python Worker
    
- gRPC通信
    

验收：

三个进程正常通信。

---

## Sprint 2（3周）

Agent闭环：

完成：

- Agent Package
    
- Deep Agents
    
- Context Builder
    
- LLM Provider
    

验收：

AI产品经理可以聊天。

---

## Sprint 3（3周）

工作能力：

完成：

- Skill Runtime
    
- File Tool
    
- Document Tool
    
- Memory
    

验收：

生成PRD。

---

## Sprint 4（2周）

产品化：

完成：

- 员工列表
    
- 员工详情
    
- 工作历史
    
- Evaluation
    

验收：

完整 Demo。

---

# 17. MVP 最终验收

成功标准：

用户：

```
@AI产品经理

分析一个真实需求
```

AI员工：

能够：

✅ 理解岗位  
✅ 加载技能  
✅ 获取知识  
✅ 调用工具  
✅ 自主规划  
✅ 输出结果  
✅ 保存经验
