# AI Employee OS MVP Implementation Blueprint v1.0

目标：

把架构设计转换为：

- Repository 结构
    
- Module 边界
    
- Runtime 实现
    
- 数据迁移
    
- Proto 接口
    
- Demo 开发路径
    

这份文档面向：

- AI Engineer
    
- Backend Engineer
    
- macOS Engineer
    

---

# 1. MVP 工程总览

最终代码结构：

```text
ai-employee-os/

├── apps/
│
│   └── macos/
│       └── AIEmployee/
│
│
├── runtime/
│
│   ├── rust-core/
│   │
│   └── python-agent/
│
│
├── packages/
│
│   ├── agents/
│   ├── skills/
│   └── tools/
│
│
├── storage/
│
│   ├── migrations/
│   ├── sqlite/
│   └── vector/
│
│
├── proto/
│
│   └── agent.proto
│
│
├── docs/
│
└── scripts/

```

---

# 2. macOS Client Module Design

目录：

```text
apps/macos/AIEmployee/


├── App/

├── Views/

├── Components/

├── Models/

├── Services/

├── Bridge/

└── Resources/

```

---

# 2.1 App Layer

入口：

```swift
AIEmployeeApp.swift
```

职责：

- 初始化 App
    
- 建立 Runtime 连接
    
- 加载用户 Workspace
    

---

结构：

```swift
@main
struct AIEmployeeApp: App {

    var body: some Scene {

        WindowGroup {

            EmployeeHomeView()

        }

    }

}

```

---

# 2.2 Views

UI 页面：

```text
Views/

├── Home/

├── Employee/

├── Chat/

├── Task/

├── Settings/

```

---

## Home

首页：

```text
我的AI员工

----------------

Alex
AI产品经理


Luna
AI运营


----------------


输入：

@AI产品经理 分析需求

```

---

## Employee Detail

展示：

```text
Alex


岗位：

AI产品经理


职责：

需求分析

PRD


Skills:

✓ PRD

✓ 竞品分析


历史：

12个任务

评分4.8

```

---

## Chat View

支持：

流式输出。

数据：

来自：

SSE Event。

---

# 2.3 Swift Service Layer

目录：

```text
Services/


├── AgentService.swift

├── TaskService.swift

├── EventService.swift

└── StorageService.swift

```

---

## AgentService

负责：

获取员工。

接口：

```swift
func listAgents()

func getAgent(id:String)

```

---

## TaskService

负责：

创建任务。

```swift
func createTask(

agentId:String,

message:String

)

```

---

## EventService

负责：

监听：

```text
task_started

tool_call

agent_message

task_completed

```

---

# 3. Rust Runtime Design

目录：

```text
runtime/rust-core/


├── src/

│
├── main.rs

├── grpc/

├── task/

├── agent/

├── tool/

├── permission/

├── storage/

├── event/

└── config/

```

---

# 3.1 Task Manager

模块：

```text
task/
```

职责：

管理任务生命周期。

状态：

```rust
enum TaskStatus {

Pending,

Planning,

Running,

Waiting,

Completed,

Failed

}

```

---

接口：

```rust
create_task()

update_status()

cancel_task()

```

---

# 3.2 Agent Manager

负责：

加载 Agent Package。

流程：

```text
Agent Package

↓

Manifest Parser

↓

Registry

↓

Agent Instance

```

---

结构：

```rust
struct Agent {

id:String,

name:String,

role:String,

skills:Vec<String>,

tools:Vec<String>

}

```

---

# 3.3 Tool Gateway

核心安全入口。

流程：

```text
Python Agent

↓

Tool Request

↓

Rust Gateway

↓

Permission Check

↓

Execute

```

---

接口：

```rust
execute_tool(

agent_id,

tool,

input

)

```

---

# 3.4 Permission Module

目录：

```text
permission/
```

负责：

```text
Agent

+

Tool

+

Resource

```

判断。

---

例如：

```json
{
agent:
"product-manager",

resource:
"/Documents/Product",

action:
"read",

allow:
true

}

```

---

# 3.5 Event Bus

事件：

```rust
enum AgentEvent {


TaskStarted,


Planning,


ToolCall,


ToolResult,


MemoryUpdated,


TaskCompleted

}

```

---

# 4. Python Agent Engine Design

目录：

```text
runtime/python-agent/


├── agents/

├── context/

├── skills/

├── memory/

├── providers/

├── evaluation/

└── deepagents/

```

---

# 4.1 Agent Adapter

封装 Deep Agents。

目录：

```text
agents/

product_manager.py

```

---

代码结构：

```python
class ProductManagerAgent:


    def execute(task):

        context = ContextBuilder.build()

        result = deep_agent.invoke(
            context
        )

        return result

```

---

# 4.2 Context Engine

目录：

```text
context/

├── builder.py

├── selector.py

└── ranking.py

```

---

流程：

```text
Task

↓

Context Selector


↓

Identity

Persona

Skill

Memory

Knowledge

Tool


↓

Prompt

```

---

# 4.3 Skill Runtime

目录：

```text
skills/


loader.py

registry.py

executor.py

```

---

加载：

```python
skill = loader.load(

"/skills/prd-generation"

)

```

---

# 4.4 Memory System

目录：

```text
memory/


extractor.py

retriever.py

store.py

```

---

保存：

```python
memory.save(

type="experience",

content="PRD需要包含ROI"

)

```

---

检索：

```python
memory.search(

"生成PRD"

)

```

---

# 4.5 Provider Adapter

目录：

```text
providers/


base.py

openai.py

deepseek.py

claude.py

```

---

统一接口：

```python
class Provider:


    def chat():

        pass


    def embedding():

        pass

```

---

# 5. Proto Design

目录：

```text
proto/

agent.proto

task.proto

tool.proto

event.proto

```

---

## agent.proto

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


}

```

---

## task.proto

```protobuf
service TaskService {


rpc CreateTask(
TaskRequest
)
returns(
TaskResponse
);


}

```

---

## event.proto

```protobuf
message AgentEvent {


string type;


string task_id;


string message;


}

```

---

# 6. Package System Design

目录：

```text
packages/


agents/

skills/

tools/

```

---

# Agent Package

```text
agents/

ai-product-manager/


├── manifest.yaml

├── AGENT.md

├── persona/

├── skills/

└── tests/

```

---

# Skill Package

```text
skills/

prd-generation/


├── SKILL.md

├── references/

├── templates/

└── tests/

```

---

# Tool Package

```text
tools/

document-tool/


├── TOOL.md

├── src/

└── tests/

```

---

# 7. Database Migration

目录：

```text
storage/migrations/


001_agents.sql

002_tasks.sql

003_memory.sql

004_tools.sql

```

---

Migration 顺序：

```text
001

Agent基础


↓

002

任务系统


↓

003

Memory


↓

004

Tool

```

---

# 8. 第一个 Demo 实现链路

目标：

完成：

AI产品经理生成 PRD。

---

## 用户输入

```text
@Alex

帮我分析企业AI知识库需求

```

---

## Step 1

Swift:

```text
CreateTask

```

---

## Step 2

Rust：

创建：

```text
task_001

```

---

## Step 3

Python：

启动：

```text
ProductManagerAgent

```

---

## Step 4

Context：

加载：

```text
Persona

PRD Skill

Memory

Knowledge

```

---

## Step 5

Deep Agent：

执行：

```text
Plan

↓

Read Files

↓

Analyze

↓

Generate

```

---

## Step 6

Tool：

调用：

```text
Document Tool

```

生成：

```text
PRD.md

```

---

## Step 7

保存：

```text
Task History

Memory

Evaluation

```

---

# 9. MVP 开发优先级

实际编码顺序：

## 第一阶段（跑通）

不要先做：

- Rust完整Kernel
    
- Skill市场
    
- Evaluation
    

先：

```text
Swift

↓

Python Agent

↓

LLM

↓

File

```

跑通。

---

## 第二阶段（架构化）

加入：

```text
Rust Runtime

Skill Runtime

Memory

```

---

## 第三阶段（产品化）

加入：

```text
Employee Center

History

Evaluation

Background Worker

```

---

# 10. 最小可运行版本（MVP-M0）

如果目标是最快验证：

只需要：

```text
SwiftUI

+

Python Deep Agent

+

SQLite

+

File Tool

+

DeepSeek API

```

流程：

```text
打开App

↓

选择Alex

↓

输入任务

↓

生成PRD

↓

保存结果

```

---

# 当前文档状态

已完成：

✅ 产品架构  
✅ 技术架构  
✅ Agent规范  
✅ API规范  
✅ ADR决策  
✅ 开发计划  
✅ Implementation Blueprint

下一步进入最后一个重要文档：

