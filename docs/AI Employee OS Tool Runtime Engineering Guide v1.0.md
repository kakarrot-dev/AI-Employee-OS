# 《AI Employee OS Tool Runtime Engineering Guide v1.0》

> 实现状态：Generic Run Kernel 只启用已注册的 `rust-native-v1` Adapter，一律经 Rust `ToolExecutor`。模型只提出 Tool ID、Action 与业务参数；安全字段全部由 Rust 生成。Browser、MCP、HTTP、Computer Use、Marketplace 不在当前 MVP。Tool 全局安装，无 per-agent 绑定表。

目标：

定义 AI 员工的“执行能力层”。

核心问题：

> AI 员工如何安全地操作外部世界？

MVP 包括：

- 文件
    
- 文档
    
- 本地 Knowledge

后置（非 MVP）：

- 浏览器 / 实时网页抓取
    
- MCP 服务
    
- Computer Use
    
- 自定义插件 Marketplace
    

---

# 1. Tool System 定位

AI Employee 模型：

```text
AI Employee


        Identity

            |

        Skill

            |

        Tool ⭐

            |

        External World

```

---

## Skill 和 Tool 的区别

必须保持清晰：

||Skill|Tool|
|---|---|---|
|回答|会什么|能做什么|
|类型|认知能力|执行能力|
|例子|竞品分析|浏览网页|
|例子|PRD生成|创建文档|
|例子|用户研究|读取数据库|

---

例如：

AI产品经理：

Skill：

```text
竞品分析
```

需要 Tool：

```text
Knowledge Tool
```

---

# 2. Tool Runtime 总体架构

```text

                 Agent


                   |

              Tool Request


                   |

              Tool Runtime


      ┌────────────┼────────────┐

      |            |            |

 Native Tool    MCP Tool   Plugin Tool


      |            |            |


 macOS API    MCP Server   Custom Code


      |            |            |


      └────────────┼────────────┘


              Permission


                   |


              Sandbox


                   |


              Execute


                   |


              Result

```

---

# 3. Tool Package 标准

目录：

```text

tool-name/


├── TOOL.md


├── manifest.yaml


├── src/


├── config/


├── permissions/


└── tests/

```

---

# 4. TOOL.md

面向人阅读。

示例：

```markdown

# File Tool


## Description

提供本地文件读写能力。


## Capabilities


- read file

- write file

- search file


## Security


需要用户授权目录。

```

---

# 5. manifest.yaml

机器读取。

```yaml

tool:


id:

file-tool


version:

1.0.0



type:

native



description:

Local filesystem access



permissions:


- filesystem.read

- filesystem.write



actions:


- read_file

- write_file

- search_file


runtime:

rust

```

---

# 6. Tool Runtime 核心模块

```text

Tool Runtime


├── Tool Loader


├── Tool Registry


├── Tool Router


├── Permission Manager


├── Sandbox Runner


├── Executor


└── Result Handler

```

---

# 7. Tool Loader

负责：

加载 Tool Package。

流程：

```text

发现Tool


↓

读取manifest.yaml


↓

验证


↓

注册


↓

Available

```

---

代码：

```python

class ToolLoader:


    def load(path):

        manifest = parse(path)


        return Tool(manifest)

```

---

# 8. Tool Registry

保存：

当前可用工具。

例如：

```text

Installed Tools:


✓ File Tool

✓ Document Tool

✓ Knowledge Tool


Disabled:


GitHub Tool

Browser Tool（Phase 2，通过 MCP 接入）

```

---

数据库：

`tools` 及其与 `actions` 的关系统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

本 Guide 定义 Tool manifest、权限与路由流程，不再维护独立建表定义。

---

# 9. Tool Router

职责：

决定：

> 当前任务应该调用哪个 Tool。

---

输入：

```json

{

task:

"读取产品文档",


available_tools:


[

"file-tool",

"knowledge-tool"

]


}

```

---

输出：

```json

{

selected_tool:

"file-tool",


action:

"read_file"

}

```

---

# 10. Tool Interface

所有 Tool 统一接口。

```python

class Tool:


    name:str


    description:str



    def execute(

        action,

        params

    ):

        pass

```

---

请求：

```json

{

tool:

"file-tool",


action:

"read_file",


params:


{

"path":

"/product/info.md"

}

}

```

---

返回：

```json

{

status:

"success",


result:


{

content:

"..."

}

}

```

---

# 11. Native Tool

官方维护。

特点：

- 稳定
    
- 安全
    
- 系统能力
    

MVP：

三个。

---

# File Tool

## 能力

```text

read_file

write_file

search_file

list_directory

watch_file

```

---

实现：

Rust。

原因：

直接接触：

- 文件系统
    
- 权限
    

---

流程：

```text

Agent

↓

Rust Tool Gateway

↓

File Permission


↓

Filesystem API

```

---

# Document Tool

能力：

```text

create_markdown

create_docx

create_pdf

convert

```

---

用途：

AI产品经理：

生成：

```text
PRD.md

PRD.docx

```

---

# Knowledge Tool

能力：

```text

search

index

retrieve

```

MVP 只索引和检索本地资料及 `knowledge/seed` 预置内容，不执行实时网页抓取。

---

连接：

```text

SQLite

+

FastEmbed

```

---

# 12. MCP Tool Adapter

目标：

兼容外部生态。

Browser Tool 计划在 Phase 2 通过 MCP Tool Adapter 接入，不属于 MVP 内置 Tool。

架构：

```text

Agent


 |

Tool Runtime


 |

MCP Client


 |

MCP Server


 |

External Service

```

---

例如：

Notion：

```text

AI产品经理

↓

Notion MCP

↓

产品数据库

```

---

GitHub：

```text

AI程序员

↓

GitHub MCP

↓

Repository

```

---

# 13. Custom Tool Plugin

企业扩展。

例如：

内部 CRM。

目录：

```text

crm-tool/


├── TOOL.md

├── manifest.yaml

├── src/

└── auth/

```

---

能力：

```yaml

actions:


- query_customer

- create_followup

```

---

# 14. Permission Architecture

Tool 是高风险边界。

必须：

```text

Agent Request


↓

Permission Gate


↓

Allow / Deny


↓

Execute

```

---

权限模型：

三层：

---

## Agent Permission

谁可以用。

例如：

```text

AI销售

允许:

CRM Tool

```

---

## Action Permission

可以做什么。

例如：

```text

CRM:


read_customer

允许


delete_customer

禁止

```

---

## Resource Permission

操作范围。

例如：

```text

允许:

/Product/


禁止:

/Finance/

```

---

# 15. Human Approval

高风险操作：

必须暂停。

例如：

发送邮件：

```text

Agent:

我要发送客户邮件。


原因:

跟进销售机会。


↓

用户确认


↓

执行

```

---

Approval Schema：

```sql

approval_requests


id

agent_id

action

status

created_at

```

---

# 16. Sandbox Runner

用于：

- scripts
    
- 第三方 Tool
    

架构：

```text

Tool Code


↓

Sandbox


↓

Resource Limit


↓

Execute

```

---

限制：

```yaml

cpu:

1 core


memory:

512MB


filesystem:

restricted


network:

controlled

```

---

# 17. Tool Execution Trace

每次调用记录：

```json

{

agent:

"AI Product Manager",


tool:

"file-tool",


action:

"read_file",


resource:

"prd.md",


result:

"success"

}

```

---

用于：

- Debug
    
- Audit
    
- Evaluation
    

---

# 18. Tool 与 Agent Loop

完整流程：

```text

Planner


↓

Executor


↓

Tool Router


↓

Permission


↓

Execute


↓

Observation


↓

Reflection


↓

Next Step

```

---

# 19. AI产品经理 Tool 流程

任务：

```text

分析产品需求

```

---

Agent：

需要：

读取资料。

调用：

```text

File Tool

```

---

获取：

```text

product.docx

feedback.md

```

---

生成：

调用：

```text

Document Tool

```

输出：

```text

requirement-analysis.md

```

---

# 20. Tool Runtime MVP 实现范围

## 实现：

✅ Tool Manifest

✅ Tool Registry

✅ Tool Interface

✅ File Tool

✅ Document Tool

✅ Knowledge Tool

✅ Permission Gate

---

## 暂缓：

⏸ MCP生态

⏸ Computer Use

⏸ Tool Marketplace

⏸ Sandbox强化

---

# 21. 最终 Tool Runtime 架构

```text

                 Tool Runtime


                     |

              Tool Registry


                     |

              Tool Router


                     |

          ┌──────────┼──────────┐


       Native       MCP       Plugin


          |          |          |


          └──────────┼──────────┘


              Permission


                     |

              Sandbox


                     |

              Execution


                     |

              Observation


```

---

# 22. Tool 机器可读契约（Canonical）

本节覆盖前文中简化的 `actions` 字符串列表和 `execute(action, params)` 示例。包内 `manifest.yaml` 是安装输入；Loader 校验、规范化后写入 `tools.manifest_json`，运行时只读取已锁定版本的数据库快照。

## 22.1 Tool manifest

```yaml
schema_version: 1.0.0
tool:
  id: file-tool
  name: File Tool
  version: 1.0.0
  description: Local filesystem access
  type: native
  runtime: rust-native-v1
  entrypoint: file_tool
  actions:
    - name: read_file
      description: Read one authorized local file
      input_schema:
        type: object
        additionalProperties: false
        required: [path]
        properties:
          path:
            type: string
      output_schema:
        type: object
        additionalProperties: false
        required: [content]
        properties:
          content:
            type: string
      required_permissions: [filesystem.read]
      risk_level: 0
      side_effect: none
      confirmation: never
      timeout_ms: 10000
      idempotency: safe
      concurrency_safe: true
      retry_policy:
        max_attempts: 2
        retry_on: [DEPENDENCY_UNAVAILABLE]
      result_size_limit: 1048576
      sensitive_fields: [arguments.path]
      verification: none
```

强制规则：

- `schema_version` 与 Tool `version` 分离，均使用 SemVer。
- `type` 只允许 `native`、`mcp`、`plugin`；`runtime` 必须是已注册适配器。
- Action 必须声明输入、输出、权限、风险、副作用、幂等、超时和重试边界。
- `side_effect` 只允许 `none`、`reversible`、`irreversible`；`idempotency` 只允许 `safe`、`keyed`、`unsafe`。
- `risk_level >= 2` 不得配置 `confirmation: never`；`idempotency: unsafe` 或不可逆 Action 不得自动重试。
- JSON Schema 默认 `additionalProperties: false`。未知契约版本、未知字段或未注册适配器均 fail closed。

## 22.2 ToolCall

```json
{
  "call_id": "call_01J...",
  "task_id": "task_01J...",
  "action_id": "action_01J...",
  "agent_id": "agent_product_manager",
  "tool_id": "file-tool",
  "tool_version": "1.0.0",
  "action": "read_file",
  "arguments": {"path": "/product/info.md"},
  "idempotency_key": "task_01J:action_01J:1",
  "permission_context": {"grant_ids": ["grant_product_docs_read"]},
  "approval_id": null,
  "deadline": "2026-08-04T10:00:10Z",
  "trace_id": "trace_01J...",
  "attempt": 1
}
```

Tool 版本必须锁定。`arguments` 在权限判断前通过 `input_schema` 校验。Skill、Agent、Workflow、MCP Adapter 和恢复流程必须经过唯一 ToolExecutor，顺序为：版本锁定 → 输入校验 → 权限 → 风险与审批 → 沙箱 → 执行 → 结果核验 → 输出校验 → 持久化。

## 22.3 ToolResult

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

`status` 只允许 `succeeded`、`failed`、`blocked`、`result_unknown`。`side_effect_state` 只允许 `none`、`not_started`、`confirmed`、`unknown`。`failed` 不能推导副作用未发生；结果不可确定时必须返回 `result_unknown`，进入人工核验，禁止自动重放。大结果返回摘要、预览和 `result_ref`，不直接写入 Agent Context。

## 22.4 错误与恢复矩阵

| 错误码 | 自动重试 | 恢复主体 | 处理 |
| --- | --- | --- | --- |
| `INVALID_ARGUMENT`、`OUTPUT_SCHEMA_INVALID` | 否 | Agent/Skill 开发者 | 终止 Action，修正契约 |
| `TOOL_NOT_FOUND`、`ACTION_NOT_FOUND`、`VERSION_MISMATCH` | 否 | Runtime/安装器 | 不得自动换版本 |
| `PERMISSION_DENIED`、`APPROVAL_REJECTED` | 否 | 用户或管理员 | 记录审计并终止 |
| `APPROVAL_REQUIRED` | 否 | 审批人 | Action 进入 `blocked` |
| `TIMEOUT`、`DEPENDENCY_UNAVAILABLE`、`RATE_LIMITED` | 仅当 manifest 允许 | Runtime | 按上限重试 |
| `EXECUTION_FAILED` | 仅当 `side_effect_state=not_started` | Runtime | 否则转人工核验 |
| `RESULT_UNKNOWN` | 否 | 人工核验 | 核验真实外部状态，不重放 |
| `CANCELLED` | 否 | 调用者 | 终止后续步骤 |

# 当前 Tool Architecture 版本

```text

AI Employee OS Tool Runtime v1.0


Native Tools

+

MCP Adapter

+

Plugin Tools


+

Permission Layer


+

Audit System

```
