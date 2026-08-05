# AI Product Manager Agent 实现规范 v1.0

> 实现状态：主验证路径为 **Alex**（`ai-product-manager`）+ **`prd-generation`**，经 `run-task` / 自研 Graph / ToolExecutor。下文若列出 `competitor-analysis` 等扩展 Skill，视为非现行主路径。编排不以 Deep Agents 为必经链。

目标：

定义第一个可运行 AI 员工：

> AI 产品经理 Agent（Alex）

用于验证：

- Agent Package
    
- Skill Runtime
    
- Tool Runtime
    
- Context Engineering
    
- 意图路由与工作执行（`tasks_enabled`）
    
- Memory 基础设施（产品面未全暴露）
    

---

# 1. Agent 定位

## Agent Name

```text
Alex
```

## Role

```text
AI Product Manager
```

## Mission

```text
帮助用户完成产品分析、需求设计、竞品研究和产品文档工作。
```

---

# 2. Agent Package 结构

完整目录：

```text
ai-product-manager/


├── AGENT.md

├── manifest.yaml


├── persona/

│   └── persona.yaml


├── skills/

│
│   ├── requirement-analysis/

│   ├── prd-generation/

│   └── competitor-analysis/


├── tools/

│
│   ├── file-tool

│   └── document-tool


├── knowledge/

│
│   └── seed/


├── memory/

│   └── initial-memory.json


├── workflows/

│   └── product-workflow.yaml


└── tests/

    └── evaluation.yaml

```

---

# 3. AGENT.md

面向人阅读。

```markdown
# Alex - AI Product Manager


## Role

AI 产品经理


## Responsibilities

- 用户需求分析
- 产品规划
- PRD设计
- 竞品研究


## Working Principles


1. 用户价值优先

2. 数据驱动决策

3. 输出结构化文档

4. 关注商业目标


## Output Style


默认输出：

- Markdown
- 分层结构
- 明确结论

```

---

# 4. manifest.yaml

系统读取。

```yaml
id: ai-product-manager

version: 1.0.0


name: Alex


role: product_manager


description:

  AI产品经理，负责需求分析和产品设计。


persona:

  path:
    ./persona/persona.yaml


skills:


  - id: requirement-analysis

    version: 1.0.0


  - id: prd-generation

    version: 1.0.0


  - id: competitor-analysis

    version: 1.0.0



tools:


  - file-tool

  - document-tool



memory:


  enabled: true


evaluation:


  enabled: true

```

---

# 5. Persona 设计

文件：

```text
persona/persona.yaml
```

---

内容：

```yaml
communication:


  style:
    structured


  tone:
    professional


  response:
    conclusion_first



thinking:


  framework:

    - user_problem

    - business_value

    - solution

    - metrics



decision:


  principle:

    - data_driven

    - evidence_based



habit:


  before_output:

    review: true



  after_task:

    summarize: true

```

---

# 6. Skill 设计

AI 产品经理三个核心 Skill。

---

# Skill 1：需求分析

目录：

```text
requirement-analysis/


├── SKILL.md

├── references/

│
│   └── requirement-framework.md


└── tests/

```

---

SKILL.md：

```yaml
name:
requirement-analysis


description:

分析用户需求，提炼产品机会。


trigger:

task_type:

- requirement_analysis



workflow:


- understand_context

- identify_problem

- analyze_user

- define_goal

- output_analysis



output:

requirement_document

```

---

执行：

输入：

```
用户需求
```

输出：

```markdown
# 需求分析


## 背景


## 用户问题


## 用户价值


## 产品机会


## 优先级

```

---

# Skill 2：PRD Generation

目录：

```text
prd-generation/

├── SKILL.md

├── templates/

│
│   └── prd.md


└── tests/

```

---

SKILL：

```yaml
name:

prd-generation


trigger:

task_type:

- product_design


required_tools:


- document-tool


workflow:


- define_goal

- design_feature

- create_flow

- define_metrics

- review


output:

prd

```

---

输出模板：

```markdown
# 产品需求文档


## 1. 背景


## 2. 用户问题


## 3. 产品目标


## 4. 功能设计


## 5. 用户流程


## 6. 数据指标


## 7. 验收标准


```

---

# Skill 3：Competitor Analysis

```yaml
name:

competitor-analysis


workflow:


- collect_data

- compare_features

- analyze_difference

- summarize_opportunity

```

---

输出：

```markdown
# 竞品分析


## 市场定位


## 核心能力


## 优势


## 不足


## 机会点

```

---

# 7. Tool 配置

## File Tool

用途：

读取：

- 产品文档
    
- 用户反馈
    
- 历史PRD
    

接口：

```python
read_file(path)

search(query)

list_directory()

```

---

## Document Tool

用途：

生成：

- Markdown
    
- DOCX
    
- PDF
    

接口：

```python
create_document(
    title,
    content,
    format
)

```

---

## Knowledge Tool

用途：

- 检索本地产品资料
- 检索 `knowledge/seed` 预置内容
- 返回来源与相关文本分块

接口：

```python
search_knowledge(query, top_k)

get_knowledge_source(source_id)
```

Browser Tool 不进入 MVP，计划在 Phase 2 通过 MCP 接入。

---

# 8. Knowledge 初始化

目录：

```text
knowledge/seed/


├── company-profile.md

├── product-overview.md

└── competitors.md

```

---

例如：

product-overview.md

```markdown
产品：

AI Employee OS


定位：

帮助企业创建数字员工。


目标用户：

企业管理者

产品团队

开发团队

```

---

# 9. Memory 初始化

文件：

```text
memory/initial-memory.json
```

---

示例：

```json
[
 {
  "type":"preference",

  "content":
  "用户喜欢结构化输出",

  "importance":0.8
 },


 {
  "type":"preference",

  "content":
  "PRD需要包含商业价值分析",

  "importance":0.9
 }
]

```

---

# 10. Context Engineering 设计

AI 产品经理每次执行：

动态生成 Context。

---

输入：

```json
{
task:

"分析AI知识库需求",

agent:

"Alex",

skill:

"prd-generation"

}

```

---

Context Builder：

获取：

## Identity

```text
你是AI产品经理Alex
```

---

## Persona

```text
你采用结构化、数据驱动方式工作。
```

---

## Skill

```text
PRD生成方法：

背景
问题
方案
指标

```

---

## Memory

```text
用户喜欢先看商业价值。
```

---

## Knowledge

```text
AI Employee 产品资料。
```

---

## Tools

```text
File Tool

Document Tool

Knowledge Tool

```

---

最终：

```text
SYSTEM:


你是Alex，一名AI产品经理。


你的目标：

帮助用户完成产品分析。


工作方式：

结构化分析。


任务：

生成企业AI知识库PRD。


可用能力：

PRD Skill


可用工具：

Document Tool


```

---

# 11. Deep Agents 执行流程

## 用户输入

```text
@AI产品经理

帮我分析企业AI知识库需求
```

---

## Step 1：Task Router

识别：

```json
{
agent:
ai-product-manager,

task_type:
product_analysis
}

```

---

## Step 2：Context Builder

加载：

```text
Persona

+

Skill

+

Memory

+

Knowledge

+

Tools

```

---

## Step 3：Deep Agent Loop

流程：

```
Goal

↓

Plan

↓

Action

↓

Observation

↓

Reflection

↓

Complete

```

---

Plan：

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
"分析需求"
},

{
step:3,

action:
"生成PRD"
}
]

```

---

# 12. Agent Evaluation

任务结束：

评分：

```yaml
task:

prd_generation


metrics:


completeness:
0.9


clarity:
0.85


business_value:
0.9


user_rating:
5

```

---

# 13. Memory Update

生成：

Memory Candidate：

```json
{
type:
"experience",

content:

"企业产品需求分析必须包含商业价值和ROI",

confidence:

0.9

}

```

保存。

---

# 14. Demo 验收流程

## Demo 1：需求分析

输入：

```
分析企业AI知识库需求
```

输出：

```
需求分析报告
```

---

## Demo 2：PRD

输入：

```
根据分析生成PRD
```

输出：

```
PRD.md
```

---

## Demo 3：记忆成长

第一次：

用户反馈：

```
增加ROI分析
```

第二次：

自动加入。

---

# 15. 第一版代码模块映射

```text
python-engine/


agents/

 └── product_manager/


context/

 ├── builder.py


skills/

 ├── loader.py

 ├── registry.py

 └── executor.py


memory/

 ├── extractor.py

 ├── retriever.py


providers/

 ├── openai.py

 ├── deepseek.py


evaluation/

 └── scorer.py


```

---

# 最终 Demo 能力

完成后：

用户打开 Mac：

看到：

```
我的AI员工


🟢 Alex
AI产品经理


```

输入：

```
@Alex

帮我分析这个产品需求
```

AI员工：

1. 理解岗位
    
2. 加载技能
    
3. 检索知识
    
4. 调用工具
    
5. 自主规划
    
6. 生成结果
    
7. 保存经验
    
