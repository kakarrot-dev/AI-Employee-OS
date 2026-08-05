# AI Employee OS Skill Engineering Guide v1.0

> 实现状态：Skill 由仓库 Package 安装，经 `agent_skills` 绑定员工；客户端不创建 Package。MVP 工作主路径 Skill 为 `prd-generation`。编排见 ADR-031，不以 LangGraph 为状态源。

目标：

定义 AI Employee OS 的能力扩展体系。

核心问题：

> AI 员工如何获得新能力？

答案：

不是修改 Prompt。

而是：

> 通过安装 Skill Package 获得专业能力。

---

# 1. Skill System 定位

在 AI Employee OS 中：

```text
AI Employee


        Identity

            |

        Persona

            |

        Skill ⭐

            |

        Tool

            |

        Memory

```

---

## Skill 定义

Skill 是：

> 一个可安装、可加载、可执行、可评估的 AI 能力模块。

类似：

- VS Code Extension
    
- npm Package
    
- Docker Plugin
    

---

# 2. Skill Package 标准

目录：

```text
skill-name/


├── SKILL.md


├── references/


├── assets/


├── templates/


├── scripts/


├── workflows/


└── tests/

```

---

# 3. 文件职责

---

## SKILL.md

核心入口。

作用：

告诉 Runtime：

- Skill是什么
    
- 什么时候触发
    
- 需要什么上下文
    
- 如何执行
    

---

## references/

知识资料。

例如：

```text
references/


prd-framework.md

user-research-method.md

product-metrics.md

```

---

## assets/

静态资源。

例如：

```text
assets/


icons/

images/

examples/

```

---

## templates/

输出模板。

例如：

```text
templates/


prd-template.md

research-template.md

```

---

## scripts/

可执行逻辑。

例如：

```text
scripts/


analyze_excel.py

generate_report.py

```

---

## workflows/

任务流程。

例如：

```yaml
steps:


- analyze_requirement


- research_competitor


- generate_prd


```

---

# 4. SKILL.md 标准 Schema

完整：

```yaml

skill:


id:
prd-generation


version:
1.0.0


name:
PRD Generator


description:

生成专业产品需求文档。



category:

product



triggers:


task_types:

- product_design

- requirement_analysis



required_context:


memory:

- user_preferences


knowledge:

- product_docs



required_tools:


- document-tool



workflow:


engine:

langgraph



steps:


- analyze

- design

- write

- review



output:


type:

document


format:

markdown


evaluation:


metrics:


- completeness

- clarity

- business_value

```

---

# 5. Skill 生命周期

完整流程：

```text

Create Skill


↓

Package


↓

Install


↓

Register


↓

Bind Agent


↓

Execute


↓

Evaluate


↓

Upgrade


↓

Remove


```

---

# 6. Skill Registry

Runtime维护：

```text

Skill Registry


Installed:


prd-generation

v1.0


competitor-analysis

v1.0


Available:


user-research

v2.0

```

---

数据库：

`skills` 与 `agent_skills` 的 canonical schema 统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

本 Guide 定义 SKILL.md manifest、版本管理和加载流程，不再维护独立建表定义。

---

# 7. Skill 加载流程

Agent收到任务：

```text

用户:

生成PRD


↓

Task Analyzer


↓

判断:

product_design


↓

Skill Retriever


↓

找到:

prd-generation


↓

Load Skill


↓

Execute


```

---

# 8. Skill Trigger 机制

Skill 不应该全部加载。

采用：

动态匹配。

---

任务：

```text

分析竞品

```

Skill Router：

匹配：

```json

{

task:

competitor_analysis,


skills:

[

competitor-analysis

]

}

```

---

# 9. Skill 与 Context Engineering

Skill不是简单 Prompt。

它提供：

```text

Instructions

+

Knowledge

+

Workflow

+

Tools

+

Evaluation

```

---

最终 Context：

```text

Identity:

AI产品经理


Skill:

PRD Generation


Method:

用户问题

↓

解决方案

↓

指标


Tool:

Document Tool


Output:

PRD

```

---

# 10. Skill Workflow

MVP 采用自研 Graph + Golden Path（ADR-031）。LangGraph 仅为后置可选实现，不得成为 Task/Action 状态源。

例如：

PRD Skill：

```text

START


 |

Requirement Analysis


 |

Solution Design


 |

PRD Writing


 |

Quality Review


 |

END

```

---

对应：

```python

workflow = StateGraph()


workflow.add_node(

"analyze",

analyze_requirement

)


workflow.add_node(

"write",

generate_prd

)


```

---

# 11. Skill Execution Runtime

架构：

```text

Skill Runtime


├── Loader

├── Registry

├── Trigger Engine

├── Context Adapter

├── Workflow Runner

├── Tool Binding

└── Evaluation

```

---

# 12. Skill Evaluation

Skill必须可衡量。

例如：

PRD Skill：

指标：

```text

Completeness

结构完整性


Clarity

表达清晰


Business Value

商业价值


Acceptance Criteria

验收标准

```

---

评分：

```json

{

skill:

prd-generation,


score:

0.92,


issues:

[

"缺少竞品分析"

]

}

```

---

# 13. 第一个 Skill：PRD Generation

目录：

```text

prd-generation/


├── SKILL.md


├── references/


│
├── prd-framework.md


├── templates/


│
└── prd.md


└── tests/

```

---

# 14. PRD Skill 执行流程

输入：

```text

用户需求

```

---

Step 1：

需求理解

输出：

```text

用户是谁

痛点是什么

目标是什么

```

---

Step 2：

方案设计

输出：

```text

功能列表

用户流程

优先级

```

---

Step 3：

文档生成

调用：

Document Tool。

---

Step 4：

Review

检查：

```text

是否包含：

背景

问题

方案

指标

验收

```

---

# 15. Skill 与 Tool 依赖

Skill声明：

```yaml

required_tools:


- document-tool

- knowledge-tool

```

---

安装时：

检查：

```text

Skill需要：

Knowledge Tool


当前：

不存在


↓

提示安装

```

---

# 16. Skill 与 Memory

Skill执行结束：

产生经验。

例如：

PRD Skill：

发现：

用户经常修改：

“商业价值不足”

Memory：

```json

{

type:

"skill_experience",


content:

"PRD需要突出商业ROI"

}

```

---

# 17. Skill Version

支持：

```text

prd-generation


v1.0

基础PRD


v1.1

增加商业分析


v2.0

支持数据指标

```

---

升级：

```text

Install New Version


↓

Compatibility Check


↓

Migrate Config


↓

Activate

```

---

# 18. Skill Security

Skill中的 scripts：

不能直接执行。

流程：

```text

Skill Script


↓

Sandbox


↓

Permission


↓

Execute

```

---

# 19. Skill 开发规范

开发一个 Skill：

步骤：

## Step 1

定义能力：

```text

我要解决什么问题？

```

---

## Step 2

定义 Trigger：

```text

什么任务触发？

```

---

## Step 3

定义 Context：

```text

需要哪些知识？

```

---

## Step 4

定义 Tool：

```text

需要什么工具？

```

---

## Step 5

定义 Evaluation：

```text

如何判断好坏？

```

---

# 20. Skill Runtime 最终架构

```text

              Skill Runtime


                   |

              Skill Loader


                   |

             Skill Registry


                   |

            Skill Router


                   |

          Workflow Executor


                   |

       ┌───────────┼───────────┐

       |           |           |

   Context      Tool       Evaluation


                   |

              Agent Result

```

---

# 21. MVP Skill 范围

第一阶段：

只实现：

## 必选

✅ SKILL.md

✅ references

✅ templates

✅ workflow

---

暂缓：

⏸ scripts执行

⏸ Skill市场

⏸ 第三方发布

---

# 22. Skill 机器可读契约（Canonical）

本节覆盖前文中只包含简化字段的 `SKILL.md` 示例。包内 manifest 是安装输入；Loader 将规范化 JSON 写入 `skills.manifest_json`，Task 开始后使用已锁定的 Skill、Tool、Prompt、Context 和权限快照。

## 22.1 Canonical manifest

```yaml
schema_version: 1.0.0
skill:
  id: prd-generation
  name: PRD Generator
  version: 1.0.0
  description: Generate a product requirements document
  category: product
  runtime_compatibility: ">=1.0.0 <2.0.0"
  status: active
  entrypoint: workflows/prd-generation.yaml
  triggers:
    task_types: [product_design, requirement_analysis]
    intents: [create_prd]
    examples: ["为新功能生成 PRD"]
    negative_examples: ["只修改一处错别字"]
    priority: 100
    conflicts_with: []
  required_context:
    - type: knowledge
      selector: product_docs
      max_items: 20
      on_missing: fail
  optional_context:
    - type: memory
      selector: user_preferences
      max_items: 10
      on_missing: continue
  required_tools:
    - id: document-tool
      version: ">=1.0.0 <2.0.0"
      actions: [create_document]
      required: true
      permissions: [document.write]
      max_calls: 2
      allow_parallel: false
      allow_side_effects: true
      on_missing: fail
  input_schema:
    type: object
    additionalProperties: false
    required: [requirement]
    properties:
      requirement:
        type: string
  output_schema:
    type: object
    additionalProperties: false
    required: [artifact_ref, summary]
    properties:
      artifact_ref:
        type: string
      summary:
        type: string
  artifact_types: [markdown_document]
  workflow:
    engine: runtime-dag-v1
    max_steps: 20
    steps:
      - id: analyze
        depends_on: []
        input_from: [skill.input, context.product_docs]
        output_as: analysis
        timeout_ms: 30000
        retry_policy:
          max_attempts: 1
        on_failure: fail_skill
      - id: write
        depends_on: [analyze]
        input_from: [steps.analyze.analysis]
        output_as: document
        tool:
          id: document-tool
          action: create_document
        approval: inherit_tool_policy
        timeout_ms: 30000
        retry_policy:
          max_attempts: 1
        on_failure: fail_skill
  completion:
    required_steps: [analyze, write]
    allow_partial: false
  evaluation:
    timing: before_delivery
    block_on_failure: true
    metrics:
      - name: completeness
        type: rubric
        threshold: 0.8
        method: references/prd-rubric.md
```

## 22.2 触发与上下文规则

- Trigger 只用于生成候选 Skill，不授予 Tool 权限，不直接开始执行。
- 多个 Skill 同时命中时，先按必需 Tool 可用性和权限硬过滤，再按 `priority` 和语义匹配排序；并列且会改变外部结果时必须请求用户确认。
- Memory、Knowledge、用户输入和上一 Step 输出必须分别声明，不得混成无类型文本对象。
- Context 必须声明数量或容量上限、缺失策略与敏感数据是否可进入模型。

## 22.3 Tool 依赖与 Workflow 规则

- Skill 必须锁定 Tool 版本范围和 Action 白名单；不得使用 Tool manifest 未公开的 Action。
- Skill 声明的权限不得小于 Action 要求，但也不代表已获得授权；真实授权由 ToolExecutor 判断。
- 每个 Step 必须具有稳定 `id`、输入来源、输出名称、依赖、超时、重试、失败与审批策略。
- Workflow 必须是无环 DAG；如未来引入循环，必须显式声明最大迭代数和终止条件。
- 只有 Tool manifest 声明 `concurrency_safe: true` 且 Step 无依赖冲突时才能并行。
- 部分成功必须由 `completion.allow_partial` 显式允许，并在输出 Schema 中表达未完成项；否则按失败处理。

## 22.4 Evaluation 规则

每个指标必须声明名称、类型、方法、阈值、执行时机及失败是否阻断交付。非确定性输出必须准备代表性正例、边界例和失败样例，不得以单次成功作为验收。

# 23. 契约校验与验收样例

Loader 和 CI 必须检查：

- Skill 引用的 Tool、版本和 Action 存在且处于 `active`。
- Skill 的 Tool 权限声明覆盖 Action 要求，Workflow 相邻 Step 的输入输出 Schema 可对接。
- `risk_level >= 2` 的调用不得缺少有效 Approval；不可逆或幂等性未知 Action 不得自动重试。
- manifest、数据库快照和运行时对象必须由同一份规范化数据生成；未知 `schema_version` fail closed。

至少保留以下 fixtures：合法只读 Tool；需要审批的副作用 Tool；依赖多个 Action 的 Skill；缺字段、未知版本、引用不存在 Tool/Action、权限不足、参数或输出 Schema 不匹配、Workflow 成环的反例；Tool 超时且结果未知、幂等键重复、审批通过/拒绝/过期的恢复用例。

# 当前 Skill Architecture 版本

```text
AI Employee OS Skill Runtime v1.0


Skill Package

+

Dynamic Loading

+

Workflow Execution

+

Tool Binding

+

Evaluation

+

Memory Feedback

```
