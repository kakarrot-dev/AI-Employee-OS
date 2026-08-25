# AI Employee OS Memory Engineering Guide v1.0

> 实现状态：Memory 属 Runtime 基础设施；产品界面尚未完整暴露。Schema 以 Unified Data Model 为准，本文只描述领域语义与生命周期。

目标：

定义 AI 员工长期记忆系统。

核心问题：

> AI 员工如何从一次次工作中积累经验，并在未来任务中表现越来越好？

---

# 1. Memory System 定位

Memory 是 AI Employee OS 区别于普通 Agent 的核心模块。

普通 Chatbot：

```text
用户提问

↓

回答

↓

结束

```

AI Employee：

```text
任务

↓

执行

↓

复盘

↓

提取经验

↓

形成记忆

↓

下一次工作优化

```

---

# 2. Memory 总体架构

采用：

> Hybrid Memory Architecture

```text

                    Memory System


                         |

        ┌────────────────┼────────────────┐

        |                |                |

 Short-term       Long-term        Knowledge


 短期上下文        长期经验          外部事实


        |                |                |

 Deep Agents      AI Employee      Knowledge Hub

 State            Memory           RAG


```

---

# 3. 三类长期 Memory

## 3.1 User Memory

定义：

> 用户个人偏好。

生命周期：

长期。

例如：

```text

用户喜欢：

- Markdown输出

- 先给结论

- PRD包含竞品分析

- 喜欢结构化表格

```

---

用途：

影响所有 AI 员工。

---

示例：

AI产品经理：

第一次：

输出普通 PRD。

用户：

> 增加商业价值分析。

保存：

```json

{

owner_type:

"user",


type:

"preference",


content:

"用户喜欢PRD包含商业价值分析"


}

```

---

后续：

所有 Agent 自动继承。

---

# 3.2 Agent Memory

定义：

> 某个 AI 员工自己的工作经验。

例如：

AI产品经理 示例员工：

```text

过去50次PRD任务总结：

用户更关注：

- ROI

- 商业价值

- 实施成本

```

---

特点：

Agent 私有。

例如：

产品经理：

拥有：

```text

产品分析经验

```

销售：

拥有：

```text

客户沟通经验

```

不能混淆。

---

# 3.3 Company Memory

定义：

> 企业共享知识和经验。

例如：

```text

公司：

产品定位

客户画像

技术架构

行业规则

流程规范

```

---

访问：

受权限控制。

---

# 4. Memory vs Knowledge

必须严格区分。

---

## Knowledge

事实。

例如：

```text

产品说明文档

API文档

市场资料

```

---

## Memory

经验。

例如：

```text

老板喜欢先看商业价值。

```

---

关系：

```text

Knowledge

提供事实


Memory

提供经验

```

---

# 5. Memory Storage Architecture

采用：

```text

Storage


├── SQLite

│

│  Metadata

│

├── FastEmbed

│

│  Vector

│

└── File System

   Raw Data

```

---

# 6. SQLite Schema

## memories 表

`memories` 的 canonical schema、约束和索引统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

本 Guide 负责 Memory 的类型、生命周期、检索和写入策略，不再维护独立建表定义。

---

字段：

## owner_type

```text

user

agent

company

```

---

## memory_type

```text

preference

experience

fact

decision

pattern

```

---

# 7. Memory Object

统一结构：

```json

{

id:

"mem_001",


owner:

"product_manager",


type:

"experience",


content:

"PRD需要包含ROI分析",


importance:

0.9,


confidence:

0.85

}

```

---

# 8. Memory 生命周期

完整流程：

```text

Observation


↓

Memory Candidate


↓

Extraction


↓

Evaluation


↓

Embedding


↓

Storage


↓

Retrieval

```

---

# 9. Memory Extraction

关键：

不要保存全部聊天。

错误：

```text

所有对话

↓

Memory

```

结果：

Memory 污染。

---

正确：

增加 Memory Extractor。

---

流程：

```text

Task Result


↓

Analyze


↓

判断：

是否长期有效？


↓

生成Candidate

```

---

# 10. Memory Candidate 判断

三个问题：

---

## 1. 是否稳定？

例如：

用户：

> 这次不要写太长。

不保存。

---

用户：

> 以后所有文档保持简洁。

保存。

---

## 2. 是否重复？

一次：

不保存。

多次：

提升权重。

---

## 3. 是否影响未来任务？

如果影响：

保存。

---

# 11. Importance Score

公式：

简单：

```text

Importance

=

Frequency

×

Impact

×

Confidence

```

---

例如：

用户偏好：

出现5次：

```text

PRD必须有ROI

```

评分：

0.95。

---

# 12. Memory Retrieval

任务执行前：

查询。

流程：

```text

Task


↓

Generate Query


↓

Embedding


↓

Vector Search


↓

Ranking


↓

Top K Memory


↓

Context Builder

```

---

例如：

任务：

```text

生成产品规划

```

检索：

返回：

```text

用户喜欢结构化方案

历史产品规划

商业分析经验

```

---

# 13. Memory Ranking

不能简单：

相似度排序。

需要：

综合：

```text

Score

=

Similarity

×

Importance

×

Confidence

×

Freshness

```

---

例如：

旧经验：

5年前。

降低权重。

---

# 14. Memory Namespace

防止污染。

结构：

```text

Memory Namespace


user/

company/

agent/


```

---

例如：

AI产品经理：

只能读取：

```text

user/

company/product/

agent/product-manager/

```

---

销售：

不能读取：

```text

agent/product-manager/

```

---

# 15. Memory 与 Context Engineering

Context Builder：

动态选择。

流程：

```text

Task


↓

Memory Query


↓

Retrieve


↓

Filter


↓

Inject Context

```

---

不要：

全部注入。

---

# 16. Memory 与 Evaluation

形成成长闭环。

流程：

```text

任务完成


↓

Evaluation


↓

发现问题


↓

Memory Candidate


↓

保存


↓

未来优化

```

---

案例：

第一次：

PRD评分：

70。

原因：

缺少竞品分析。

保存：

```text

经验：

PRD默认加入竞品分析章节。

```

---

第十次：

自动优化。

---

# 17. Memory Conflict Resolution

现实：

可能有冲突。

例如：

旧：

```text

用户喜欢详细分析

```

新：

```text

用户要求简短输出

```

---

解决：

加入：

## Memory Versioning

```text

Memory A

confidence:

0.7


Memory B

confidence:

0.9

```

---

选择：

最新、高置信度。

---

# 18. Memory API

## Save

```python

memory.save(

owner="agent",

type="experience",

content="..."

)

```

---

## Search

```python

memory.search(

query="PRD"

)

```

---

## Update

```python

memory.update(

id,

confidence

)

```

---

# 19. Memory Engine 模块

代码：

```text

memory/


├── extractor.py


├── store.py


├── retriever.py


├── ranking.py


├── embedding.py


└── conflict.py

```

---

# 20. FastEmbed 集成

流程：

```text

Memory Content


↓

FastEmbed


↓

Vector


↓

Index


↓

Search

```

---

# 21. MVP Memory 实现范围

Runtime 已具备（产品面未全暴露）：

- User / Agent Memory 表结构与基础读写路径
- Context 注入挂钩（按任务需要启用）

暂缓 / 非现行主路径：

- Memory Extractor 自动化闭环
- Vector Retrieval（FastEmbed 后置，见 ADR）
- Memory 自动重构
- Memory Graph
- Agent 自主修改 Memory Schema

---

# 22. AI产品经理 Memory 示例

## 初始

```json

{

agent:

示例员工,


memory:


[

"用户喜欢结构化输出"

]

}

```

---

## 工作100次后

```json

{

agent:

示例员工,


experience:


[

"PRD需要包含商业价值"

"需求分析先明确用户问题"

"输出方案必须包含指标"

]

}

```

---

# 23. 最终 Memory Architecture

```text

                 Memory System


                      |

             Memory Manager


                      |

       ┌──────────────┼──────────────┐


       |              |              |

 User Memory    Agent Memory   Company Memory


       |              |              |

       └──────────────┼──────────────┘


                SQLite


                    +


               FastEmbed


                    |


            Context Engineering


                    |


               Agent Runtime

```

---

# 当前 Memory Architecture 版本

```text

AI Employee OS Memory System v1.0


Hybrid Memory

+

SQLite

+

FastEmbed

+

Dynamic Retrieval

+

Evaluation Feedback Loop

```
# Business Flow 与 Memory 隔离

员工私人 Conversation 与 Employee Memory 不因共同参与 Flow 而共享。下游 Context 只能出现用户显式共享且授权的 SharedContextRef，或 Rust 接受的 `deliverable:<id>` Handoff 引用。模型摘要、消息文本和 UI 状态不能作为恢复或授权事实。
