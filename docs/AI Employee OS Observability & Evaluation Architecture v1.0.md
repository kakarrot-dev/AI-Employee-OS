# AI Employee OS Observability & Evaluation Architecture v1.0

> 实现状态：基础 Trace / Evaluation 属 Runtime 基础设施；产品界面尚未完整暴露为「员工绩效仪表盘」。Schema 以 Unified Data Model 为准。

目标：

定义 AI 员工如何：

- 被观察
    
- 被分析
    
- 被评价
    
- 被优化
    

核心问题：

> 一个 AI 员工完成任务后，如何判断它做得好不好？

---

# 1. Observability 定位

传统软件：

关注：

```text
程序是否运行
```

AI Agent：

需要关注：

```text
为什么这样做？

用了什么工具？

消耗多少资源？

结果质量如何？

是否值得信任？

```

因此：

AI Employee OS 需要：

> AI Agent 可观测性系统。

---

# 2. Observability 总体架构

```text
                      AI Employee Task


                              |

                         Agent Runtime


                              |

                    Observability Layer


      ┌──────────────┬──────────────┬──────────────┐

      |              |              |

    Trace          Metrics         Logs

    链路             指标            日志


      |              |              |


      └──────────────┼──────────────┘


                     |

              Evaluation Engine


                     |

             Performance Store


                     |

             Employee Dashboard

```

---

# 3. 四类核心数据

## 3.1 Trace（执行链路）

回答：

> AI 员工到底经历了什么？

例如：

任务：

```text
@Alex 分析企业AI知识库需求
```

Trace：

```text
Task Created

↓

Context Build

↓

Memory Retrieval

↓

Skill Loading

↓

LLM Call

↓

Tool Call

↓

Observation

↓

Review

↓

Completed

```

---

# Trace 数据模型

```json
{
trace_id:

"trace_001",


task_id:

"task_001",


agent_id:

"product_manager",


spans:

[

{

name:

"context_build",

duration:

200ms

},


{

name:

"llm_call",

model:

"deepseek",

tokens:

8000

}

]

}

```

---

# 4. Span 设计

每个执行步骤都是 Span。

例如：

## Context Span

```json
{
type:

"context",


input:

"generate PRD",


output:

"loaded skill + memory"

}

```

---

## LLM Span

记录：

```json
{
model:

"deepseek-chat",

input_tokens:

5000,


output_tokens:

2000,


latency:

3.2s

}

```

---

## Tool Span

例如：

```json
{
tool:

"file-tool",


action:

"read_file",


resource:

"product.md",


status:

"success"

}

```

---

# 5. Task Replay（任务回放）

AI 员工必须支持：

> 查看一次任务完整过程。

类似：

查看员工工作日志。

---

UI：

```text
Alex 工作记录


任务：

生成企业AI知识库PRD


时间线：


10:01

理解任务


10:02

读取产品资料


10:04

分析竞品


10:06

生成PRD


10:08

完成


```

---

注意：

展示：

✅ 行动

✅ 工具调用

✅ 状态变化

❌ 不展示模型隐藏思维链

---

# 6. Metrics（指标系统）

分三类：

---

# 6.1 Agent Metrics

衡量员工表现。

例如：

AI 产品经理：

```text
任务数量：

128


成功率：

94%


平均评分：

4.7


平均耗时：

3分钟

```

---

指标：

```text
Task Success Rate

Completion Time

Quality Score

User Satisfaction

```

---

# 6.2 Runtime Metrics

衡量系统。

例如：

```text
Active Agents

Running Tasks

Queue Length

Memory Usage

CPU

```

---

# 6.3 Model Metrics

衡量模型成本。

例如：

```text
Provider:

DeepSeek


Tokens:

15000


Latency:

4s


Cost:

$0.03

```

---

# 7. Cost Tracking

虽然当前不考虑商业，但技术必须记录。

原因：

多个 AI 员工运行时：

可能同时调用模型。

---

数据：

```json
{
agent:

"product-manager",


model:

"deepseek",


tokens:

12000,


cost:

0.02

}

```

---

用于：

未来 Model Router：

自动选择：

```text
简单任务:

DeepSeek


复杂任务:

Claude/GPT

```

---

# 8. Evaluation System

Observability 负责：

“发生了什么”。

Evaluation 负责：

“好不好”。

---

架构：

```text
Result

↓

Evaluation Engine

↓

Score

↓

Performance Update

```

---

# 9. Evaluation 四层模型

```text
                 Agent Evaluation


        ┌─────────┬─────────┬─────────┬─────────┐

        |         |         |         |

     Task      Quality    Cost    User

     成功       质量       成本     反馈

```

---

# 10. Task Success Evaluation

判断：

有没有完成。

例如：

PRD任务：

检查：

```text
文件是否生成

内容是否存在

格式是否正确

```

---

结果：

```json
{
success:

true

}

```

---

# 11. Quality Evaluation

判断：

质量。

---

AI产品经理：

PRD评分：

```text
完整性

↓

结构

↓

商业价值

↓

可执行性

```

---

示例：

```json
{
quality:

0.91,


metrics:

{

completeness:
0.95,


clarity:
0.9,


business_value:
0.88

}

}

```

---

# 12. Automated Evaluation

使用：

Evaluator Agent。

流程：

```text
Output

↓

Evaluator Agent

↓

Rubric

↓

Score

```

---

例如：

PRD Evaluation Prompt：

```text
请评价这份PRD：

检查：

1. 是否明确用户问题

2. 是否有目标指标

3. 是否可执行

输出0-100分。

```

---

# 13. Human Feedback

AI员工必须接受用户评价。

完成后：

```text
任务完成


满意吗？

👍

👎

```

---

反馈：

进入：

```text
Evaluation

↓

Memory

```

---

# 14. Performance Dashboard

员工详情页：

增加：

```text
Alex

AI产品经理


工作表现：


完成任务：

128


成功率：

94%


平均评分：

4.8


最佳能力：

PRD生成


待提升：

竞品研究

```

---

# 15. Skill Evaluation

评价：

不是只有员工。

Skill 也需要评价。

例如：

PRD Skill：

```text
使用次数:

300


平均评分:

4.7


成功率:

92%

```

---

发现：

Skill质量下降：

需要优化。

---

# 16. Evaluation 数据库设计

`evaluations`、`feedbacks` 和 `metrics` 的 canonical schema、关系和索引统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

本 Architecture 负责事件采集、指标语义、评估方法和反馈闭环，不再维护独立建表定义。

---

# 17. Observability Pipeline

完整流程：

```text
Agent


↓

Event Bus


↓

Trace Collector


↓

Metrics Collector


↓

Evaluation Engine


↓

Storage


↓

Dashboard

```

---

# 18. Runtime 模块

新增：

```text
runtime/


observability/


├── tracer.py

├── metrics.py

├── logger.py

├── cost.py

└── evaluator.py

```

---

# 19. Agent Debug 模式

开发阶段：

提供：

Developer Console。

例如：

```text
Task:

生成PRD


Trace:


Context:

Loaded


Skill:

prd-generation


Tool:

file-tool


Model:

DeepSeek


Failure:

Missing competitor data

```

---

# 20. 与 Memory 的连接

Evaluation：

产生：

Improvement Signal。

流程：

```text
Evaluation


↓

发现问题


↓

Memory Candidate


↓

保存经验


↓

未来优化

```

---

案例：

第一次：

PRD评分：

72。

原因：

缺少商业指标。

Memory：

```text
生成PRD必须包含ROI分析。

```

---

后续：

自动改善。

---

# 21. MVP Observability 范围

Runtime 已具备（产品面未全暴露）：

- Task / Action 事件与基础 Trace
- Tool 执行记录
- ModelCall 用量字段
- Evaluation / Feedback 表结构与写入路径

暂缓 / 非现行主路径：

- 面向用户的 Agent Performance 仪表盘
- 分布式 Tracing
- 企业监控平台
- 自动调优系统

---

# 22. 最终 Observability 架构

```text
                    AI Employee


                         |

                   Agent Runtime


                         |

              Observability Engine


      ┌────────────┬────────────┬────────────┐

      |            |            |

    Trace       Metrics       Logs


      |            |            |


      └────────────┼────────────┘


                  Evaluation


                      |

              Performance Model


                      |

              Employee Dashboard

```

---

# 当前版本

```text
AI Employee OS Observability v1.0


Trace

+

Metrics

+

Logs

+

Evaluation

+

Performance

```

---

至此，AI Employee OS 核心技术体系已经完成：

1. 总体架构 ✅
    
2. Agent Runtime ✅
    
3. Skill Runtime ✅
    
4. Tool Runtime ✅
    
5. Memory System ✅
    
6. Security System ✅
    
7. Observability & Evaluation ✅
    
