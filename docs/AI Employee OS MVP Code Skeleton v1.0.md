# 《AI Employee OS MVP Code Skeleton v1.0》

目标：

提供一个可以直接初始化 Git 仓库的工程骨架。

原则：

- 先跑通 AI Employee 闭环
    
- 保留未来 Runtime 演进空间
    
- 模块边界清晰
    
- 不提前实现复杂能力
    

---

# 1. Repository Structure

最终目录：

```text
ai-employee-os/

├── apps/
│
│   └── macos/
│       └── AIEmployee/
│
│           ├── AIEmployeeApp.swift
│           ├── AppState.swift
│           │
│           ├── Views/
│           │   ├── HomeView.swift
│           │   ├── ChatView.swift
│           │   ├── EmployeeView.swift
│           │   └── TaskView.swift
│           │
│           ├── Models/
│           │   ├── Agent.swift
│           │   ├── Task.swift
│           │   └── Event.swift
│           │
│           ├── Services/
│           │   ├── AgentService.swift
│           │   ├── TaskService.swift
│           │   └── EventService.swift
│           │
│           └── Resources/
│
│
├── runtime/
│
│   ├── rust-core/
│   │
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── grpc/
│   │       ├── task/
│   │       ├── agent/
│   │       ├── tool/
│   │       ├── permission/
│   │       └── storage/
│   │
│   │
│   └── python-agent/
│
│       ├── pyproject.toml
│       │
│       └── app/
│           ├── main.py
│           │
│           ├── agents/
│           ├── context/
│           ├── skills/
│           ├── memory/
│           ├── tools/
│           └── providers/
│
│
├── packages/
│
│   ├── agents/
│   │
│   │   └── ai-product-manager/
│   │
│   │
│   ├── skills/
│   │
│   │   └── prd-generation/
│   │
│   └── tools/
│
│       └── document-tool/
│
│
├── storage/
│
│   ├── migrations/
│   └── database/
│
│
├── proto/
│
│   ├── agent.proto
│   ├── task.proto
│   └── event.proto
│
│
└── README.md

```

---

# 2. Swift macOS App Skeleton

## AIEmployeeApp.swift

```swift
import SwiftUI


@main
struct AIEmployeeApp: App {


    @StateObject
    private var appState = AppState()


    var body: some Scene {

        WindowGroup {

            HomeView()
                .environmentObject(appState)

        }

    }

}

```

---

# AppState

负责：

全局状态。

```swift
import Foundation


class AppState: ObservableObject {


    @Published
    var agents:[Agent] = []


    @Published
    var currentTask:Task?


}

```

---

# Agent Model

```swift
struct Agent:Identifiable {


    let id:String


    let name:String


    let role:String


    let status:String


}

```

---

# HomeView

```swift
struct HomeView:View {


    var body: some View {


        VStack {


            Text("AI Employee")


            Text("我的员工")


        }

    }

}

```

---

# ChatView

核心入口：

```swift
struct ChatView:View {


    @State
    var message=""


    var body: some View {


        VStack {


            TextField(
                "输入任务 @AI员工",
                text:$message
            )


            Button("发送"){

                send()

            }


        }

    }



    func send(){

        // Task API

    }

}

```

---

# 3. Rust Runtime Skeleton

## Cargo.toml

```toml
[package]

name="ai-runtime"

version="0.1.0"


[dependencies]


tokio="1"

tonic="0.11"

prost="0.12"

serde="1"

rusqlite="0.31"

```

---

# main.rs

```rust
#[tokio::main]
async fn main(){


    println!(
        "AI Employee Runtime Started"
    );


    start_grpc_server()
        .await;


}

```

---

# Task Manager

目录：

```
task/
```

---

task.rs：

```rust
pub struct Task {


    pub id:String,


    pub agent_id:String,


    pub message:String,


    pub status:TaskStatus,


}


pub enum TaskStatus {


    Pending,

    Running,

    Completed,

    Failed

}

```

---

# Agent Manager

```rust
pub struct Agent {


    pub id:String,


    pub name:String,


    pub role:String


}


pub fn load_agent(
    path:String
)->Agent{


    // parse manifest.yaml


}

```

---

# Tool Gateway

核心：

```rust
pub async fn execute_tool(

agent_id:String,

tool:String,

input:String

){


    check_permission();


    run_tool();


}

```

---

# Permission

```rust
pub fn check_permission(

agent:String,

resource:String

)->bool{


    true


}

```

---

# 4. Python Agent Skeleton

## pyproject.toml

```toml
[project]

name="ai-agent"

version="0.1.0"


dependencies=[

"deepagents",

"langgraph",

"fastembed",

"sqlalchemy"

]

```

---

# main.py

```python
from agents.product_manager import ProductManager


def main():


    agent = ProductManager()


    agent.run(
        "分析企业AI知识库需求"
    )


if __name__=="__main__":

    main()

```

---

# 5. Agent Implementation

目录：

```
agents/

product_manager.py
```

---

代码：

```python
class ProductManager:


    def __init__(self):

        self.role="AI Product Manager"



    def run(self,task):


        context = self.build_context(task)


        result = self.agent.invoke(
            context
        )


        return result



    def build_context(self,task):

        return {

            "task":task

        }

```

---

# 6. Context Builder

目录：

```
context/
```

---

builder.py：

```python
class ContextBuilder:


    def build(

        self,

        agent,

        task

    ):


        return {


        "identity":
        agent.identity,


        "persona":
        agent.persona,


        "skills":
        agent.skills,


        "memory":
        self.retrieve_memory(task)



        }

```

---

# 7. Skill Loader

目录：

```
skills/
```

---

loader.py：

```python
import yaml


class SkillLoader:


    def load(path):


        with open(
            path+"/SKILL.md"
        ) as f:


            return yaml.safe_load(f)

```

---

# 8. Memory System

目录：

```
memory/
```

---

store.py：

```python
class MemoryStore:


    def save(

        self,

        content,

        importance

    ):


        pass



    def search(

        self,

        query

    ):


        pass

```

---

# 9. LLM Provider

目录：

```
providers/
```

---

base.py：

```python
class LLMProvider:


    def chat(
        self,
        messages
    ):

        raise NotImplementedError

```

---

deepseek.py：

```python
class DeepSeekProvider(
    LLMProvider
):


    def chat(
        self,
        messages
    ):


        return response

```

---

# 10. Agent Package 示例

目录：

```
packages/agents/
```

---

ai-product-manager：

```text
ai-product-manager/

├── manifest.yaml

├── AGENT.md

├── persona/

│   └── persona.yaml


├── skills/

│
└── tools/

```

---

manifest：

```yaml
id:
ai-product-manager


name:
Alex


role:
product_manager


skills:

- prd-generation


tools:

- document-tool

```

---

# 11. Skill Package 示例

目录：

```
packages/skills/prd-generation
```

---

SKILL.md：

```yaml
name:

prd-generation


description:

Generate Product Requirement Document


workflow:

- analyze

- design

- write

- review

```

---

# 12. Tool Package 示例

document-tool：

```text
document-tool/

├── TOOL.md

└── tool.py

```

---

tool.py：

```python
class DocumentTool:


    def create(

        title,

        content

    ):


        with open(
            title+".md",
            "w"
        ) as f:


            f.write(content)

```

---

# 13. Database Migration

Migration 按领域和外键依赖顺序组织：

```text
001_agents_and_personas.sql
002_capabilities.sql
003_tasks_and_actions.sql
004_memories.sql
005_knowledge.sql
006_permissions_and_audit.sql
007_evaluations.sql
```

各 migration 的字段、约束与索引必须从 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]] 生成。本 Code Skeleton 只定义工程骨架，不维护简化 schema。

---

# 14. 第一个 Demo 最短路径

实际编码顺序：

不要先实现全部。

## Day 1-3

完成：

```text
Swift Chat UI

↓

Python Agent

↓

DeepSeek API

```

目标：

能聊天。

---

## Day 4-7

加入：

```text
Agent Package

↓

Skill Loader

↓

File Tool

```

目标：

能读取资料。

---

## Week 2

加入：

```text
Memory

↓

FastEmbed

↓

PRD Skill

```

目标：

能生成产品文档。

---

## Week 3

接入：

```text
Rust Runtime

↓

Permission

↓

gRPC
```

---

# 15. 第一版 Demo 成功状态

打开：

AI Employee

看到：

```
Alex
AI产品经理
```

输入：

```
@Alex

分析这个产品需求
```

后台：

```
Alex:

读取产品资料

调用需求分析Skill

生成PRD

保存经验
```

输出：

```
PRD.md
```

---

# MVP Coding Order（最终）

按优先级：

```
1. Python Agent + Deep Agents
2. Skill Runtime
3. Tool Runtime
4. Memory
5. Swift UI
6. Rust Runtime
7. Permission
8. Evaluation
9. Observability
```
