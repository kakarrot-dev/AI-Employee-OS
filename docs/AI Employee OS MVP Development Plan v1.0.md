# AI Employee OS MVP Development Plan v1.0

目标：

将前面的架构设计转化为一个可执行研发计划。

核心目标：

> 10 周内完成 AI Employee OS POC，实现多个 AI 员工独立完成工作闭环。

---

# 1. MVP 开发目标

## 产品目标

验证：

```text
用户
 ↓
AI员工通讯录
 ↓
@AI员工
 ↓
Agent自主执行
 ↓
生成工作成果
 ↓
沉淀经验
```

---

## 技术目标

验证：

- macOS Native Client
    
- Agent Runtime
    
- Deep Agents
    
- Skill Runtime
    
- Tool Runtime
    
- Memory System
    
- Evaluation System
    

---

# 2. MVP 范围冻结

## In Scope

### Client

✅ macOS App

✅ AI员工列表

✅ 员工详情

✅ Chat入口

✅ @AI员工

---

### Agent

✅ Agent Package

✅ Persona

✅ Skill

✅ Tool

✅ Memory

---

### Runtime

✅ Task管理

✅ Agent Loop

✅ Context Engineering

✅ Deep Agents

---

### Tools

✅ File Tool

✅ Document Tool

✅ Knowledge Tool

---

### Storage

✅ SQLite

✅ FastEmbed

✅ Local File Storage

---

## Out of Scope

暂不实现：

❌ Computer Use

❌ Multi-Agent协作

❌ Cloud Sync

❌ 企业组织

❌ Marketplace

❌ MCP生态

❌ 自动Skill进化

---

# 3. 团队角色划分

推荐最小团队：

```text
AI Employee Team


        Product Owner

             |

 ┌───────────┼───────────┐

 |           |           |

macOS       Agent       Infra

Engineer    Engineer    Engineer

```

---

# 4. 人员职责

---

# 1. macOS Engineer

负责：

SwiftUI Client

模块：

```text
apps/macos/


├── Employee UI

├── Chat UI

├── Profile

├── Event Display

├── Settings

└── Permission UI

```

---

技能：

- SwiftUI
    
- AppKit
    
- gRPC Swift
    
- macOS API
    

---

# 2. Agent Engineer

负责：

Python AI Engine。

模块：

```text
python-engine/


├── Agent

├── Context

├── Deep Agents

├── Skills

├── Memory

└── Evaluation

```

---

技能：

- Python
    
- LangGraph
    
- Deep Agents
    
- RAG
    
- Prompt Engineering
    

---

# 3. Runtime Engineer

负责：

Rust Kernel。

模块：

```text
rust-core/


├── Task

├── IPC

├── Tool Gateway

├── Permission

├── Storage

└── Event

```

---

技能：

- Rust
    
- gRPC
    
- SQLite
    
- IPC
    

---

# 5. Sprint Roadmap

---

# Sprint 0（第1周）

## 目标：

建立工程骨架。

---

完成：

### Monorepo

```text
ai-employee-os

├── apps

├── runtime

├── skills

├── tools

└── docs

```

---

### 三进程启动

实现：

```text
Swift App

↓

Rust Runtime

↓

Python Worker

```

---

验收：

点击 App：

看到：

```text
Runtime Connected
```

---

# Sprint 1（第2周）

## 目标：

完成 AI员工基础模型。

---

实现：

## Agent Package Loader

加载：

```text
ai-product-manager/

manifest.yaml

```

---

完成：

Agent:

```text
Alex

AI产品经理

```

---

数据库：

完成：

```sql
agents

personas

skills

```

---

验收：

App显示：

```text
我的AI员工


Alex

AI产品经理

```

---

# Sprint 2（第3周）

## 目标：

完成 Chat 闭环。

---

实现：

用户：

```text
@AI产品经理

你好
```

流程：

```text
Swift

↓

Rust

↓

Python

↓

LLM

↓

Response

```

---

完成：

- Task API
    
- Agent Worker
    
- LLM Provider
    

---

验收：

AI员工可以对话。

---

# Sprint 3（第4周）

## 目标：

Context Engineering。

---

实现：

Context Builder：

加载：

```text
Identity

Persona

Skill

Memory

Knowledge

Tool
```

---

验收：

不同 Agent：

输出风格不同。

例如：

产品经理：

结构化。

---

# Sprint 4（第5周）

## 目标：

Skill Runtime。

---

实现：

Skill Loader：

读取：

```text
SKILL.md
```

---

上线：

三个 Skill：

```text
Requirement Analysis

PRD Generation

Competitor Analysis

```

---

验收：

安装 Skill 后：

Agent能力变化。

---

# Sprint 5（第6周）

## 目标：

Tool Runtime。

---

实现：

## File Tool

支持：

```text
read

search

list
```

---

## Document Tool

支持：

```text
markdown

docx
```

---

## Knowledge Tool

支持：

```text
检索本地资料

检索 knowledge/seed 预置内容

返回来源和文本分块
```

Browser Tool 不进入 MVP，计划在 Phase 2 通过 MCP 接入。

---

验收：

AI产品经理：

通过 Knowledge Tool 检索本地资料，并使用 Document Tool 生成文档。

---

# Sprint 6（第7周）

## 目标：

Memory System。

---

实现：

SQLite：

```text
memory

knowledge

history

```

---

FastEmbed：

实现：

语义检索。

---

验收：

第一次：

用户：

> PRD需要商业价值。

第二次：

自动应用。

---

# Sprint 7（第8周）

## 目标：

Agent Loop + State。

---

接入：

Deep Agents。

实现：

```text
Plan

↓

Execute

↓

Observe

↓

Reflect

```

---

增加：

Checkpoint。

---

验收：

任务中断：

可以恢复。

---

# Sprint 8（第9周）

## 目标：

产品体验。

---

完成：

Employee Directory：

```text
Alex

Luna

```

---

Employee Profile：

展示：

- 能力
    
- Skill
    
- 历史
    
- 评分
    

---

工作记录：

```text
Alex完成：

PRD生成

耗时：

3分钟

评分：

4.8
```

---

# Sprint 9（第10周）

## 目标：

POC Demo。

---

完整 Demo：

## 场景：

用户：

```text
@AI产品经理

分析企业AI知识库需求
```

---

AI员工：

执行：

```text
读取资料

↓

分析需求

↓

竞品研究

↓

生成PRD

↓

保存经验

```

---

# 6. Git Strategy

采用：

Trunk Based Development。

---

分支：

```text
main

|

develop

|

feature/*
```

---

Feature：

例如：

```text
feature/macos-chat

feature/context-engine

feature/skill-runtime

feature/tool-file

```

---

# 7. Interface Freeze Strategy

## Week 1 Freeze

冻结：

### Agent API

### Task API

### Event Schema

---

## Week 3 Freeze

冻结：

### Skill Manifest

### Tool Interface

---

## Week 5 Freeze

冻结：

### Memory API

---

# 8. Demo Milestones

---

## Demo 1（Week 2）

看到：

```text
AI员工列表
```

---

## Demo 2（Week 3）

看到：

```text
@Alex聊天
```

---

## Demo 3（Week 5）

看到：

```text
Alex读取文件

生成PRD
```

---

## Demo 4（Week 8）

看到：

```text
Alex自主规划任务
```

---

## Demo 5（Week 10）

完整闭环。

---

# 9. 技术风险

---

## 风险1：Deep Agents集成复杂

解决：

先封装 Adapter。

不要深度绑定。

结构：

```text
Your Runtime

↓

Agent Adapter

↓

Deep Agents
```

---

## 风险2：Context膨胀

解决：

动态检索。

不要：

全部 Memory 注入。

---

## 风险3：Skill设计过度复杂

解决：

MVP：

先支持：

```text
SKILL.md

+

references

```

scripts 后置。

---

## 风险4：Rust过早复杂化

建议：

第一阶段：

Rust只做：

- IPC
    
- Task
    
- Permission
    

不要做完整 Kernel。

---

# 10. MVP 验收 Checklist

## 产品

✅ 有AI员工列表

✅ 可以@员工

✅ 可以查看员工详情

---

## Agent

✅ 有身份

✅ 有Persona

✅ 有Skill

✅ 有Tool

---

## Execution

✅ 自动规划

✅ 工具调用

✅ 输出结果

---

## Memory

✅ 保存经验

✅ 下一次生效

---

## 技术

✅ Swift/Rust/Python通信

✅ SQLite

✅ FastEmbed

✅ Deep Agents

---

# 最终 MVP 目标

10周后：

打开 Mac：

看到：

```text
AI Employee


我的员工


🟢 Alex

AI产品经理

```

输入：

```text
@Alex

帮我分析这个产品需求
```

AI员工：

```text
收到任务

正在分析


✓ 读取资料

✓ 调用竞品分析Skill

✓ 生成PRD

✓ 保存经验


完成。

```

---

至此：

- 架构设计 ✅
    
- Agent规范 ✅
    
- API规范 ✅
    
- 开发计划 ✅
    
