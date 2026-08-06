# 《AI Employee OS Security & Permission Architecture v1.0》

> 实现状态：Permission / Approval / Audit 属 Rust Runtime。Generic Run 在 Tool 前先持久化 Action；未授权时 Action=`blocked`、Run=`waiting_approval`、Task 保持 `running`。批准后仍经 ToolExecutor；`result_unknown` 禁止自动重放。Secret 边界见 `AGENTS.md`。

目标：

定义 AI 员工如何在 macOS 上安全地拥有：

- 文件访问能力
    
- Tool 执行能力
    
- 后台运行能力
    
- 企业数据访问能力
    

核心原则：

> AI 员工拥有能力，但不拥有无限权限。

---

# 1. Security Design Philosophy

传统软件：

```text
User

↓

Application

↓

System

```

---

AI Employee：

```text
User

↓

AI Employee

↓

Agent Runtime

↓

Tool

↓

System Resource

```

中间增加：

```text
Permission Boundary

```

---

最终：

```text
AI Employee

只能通过：

Permission

↓

Tool Runtime

↓

System

```

访问外部世界。

---

# 2. Security Architecture Overview

```text

                    AI Employee


                         |

                  Agent Runtime


                         |

                Security Kernel


        ┌───────────────┼───────────────┐

        |               |               |

 Permission        Sandbox        Approval

 Gate              Runtime        Manager


        |               |               |

        └───────────────┼───────────────┘


                         |

                  Tool Runtime


                         |

                  macOS System


```

---

# 3. Security Layers

四层：

---

## Layer 1：Permission Gate

控制：

> 谁可以做什么。

---

## Layer 2：Sandbox

控制：

> 在什么环境执行。

---

## Layer 3：Human Approval

控制：

> 哪些行为需要人确认。

---

## Layer 4：Audit Log

控制：

> 所有行为可追踪。

---

# 4. Permission Model

采用：

RBAC + Resource Permission + Action Permission

组合。

---

# 4.1 Agent Permission

定义：

AI 员工权限。

例如：

AI 产品经理：

```yaml
agent:

name:
Alex


permissions:


filesystem:

- read:/Product


tools:

- file-tool

- document-tool


network:

browser:true

```

---

# 4.2 Tool Permission

控制工具能力。

例如：

File Tool：

```text

read_file

write_file

delete_file

```

权限等级：

```text

READ

WRITE

DELETE

EXECUTE

```

---

默认：

```text

READ

WRITE

允许


DELETE

EXECUTE

禁止

```

---

# 4.3 Resource Permission

控制资源范围。

例如：

允许：

```text

/Users/name/Documents/Product

```

禁止：

```text

/Users/name/Documents/Private

```

---

# 5. Permission Evaluation Flow

完整流程：

```text

Agent Request


↓

Tool Runtime


↓

Permission Manager


↓

Check:

Agent

+

Tool

+

Resource

+

Action


↓

Allow / Deny


↓

Execute

```

---

# 6. Permission Schema

SQLite：

## permissions 表

`permissions` 的 canonical schema、唯一约束和主体边界统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

---

示例：

```json

{

subject_type:

"agent",


subject_id:

"product-manager",


resource:

"/Product",


action:

"read",


effect:

"allow"

}

```

---

# 7. Tool Security Boundary

关键原则：

> Python Agent 不直接访问系统。

错误：

```text

Python Agent

↓

os.read_file()

```

---

正确：

```text

Python Agent


↓

Tool Request


↓

Rust Runtime


↓

Permission


↓

Swift/macOS API


↓

System

```

---

# 8. Rust Security Kernel

Rust 作为可信边界。

架构：

```text

                 Rust Runtime


              Security Kernel


 ┌────────────┬────────────┬────────────┐

 |            |            |

Permission   Policy     Audit

Engine       Engine     Logger


```

---

职责：

- 拦截 Tool 请求
    
- 验证权限
    
- 执行审批
    
- 记录日志
    

---

# 9. Human Approval System

不是所有任务自动执行。

分级：

---

# Risk Level 0

自动执行。

例如：

```text

读取文件

搜索网页

生成Markdown

```

---

# Risk Level 1

记录即可。

例如：

```text

创建文档

修改非关键文件

```

---

# Risk Level 2

需要确认。

例如：

```text

发送邮件

上传文件

修改共享数据

```

---

# Risk Level 3

禁止或强制人工。

例如：

```text

删除大量文件

支付

修改系统配置

```

---

# Approval Flow

```text

Agent


↓

Request Action


↓

Risk Analyzer


↓

Need Approval?


↓

YES


↓

User Confirm


↓

Execute


```

---

# Approval 数据模型

`approvals` 与 Task、Agent 的关系及状态约束统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

---

# 10. Sandbox Runtime

用于：

执行：

- Skill Scripts
    
- Tool Plugins
    
- Code
    

---

架构：

```text

Script


↓

Sandbox Runner


↓

Resource Limits


↓

Execute


↓

Result

```

---

# Sandbox 限制

## CPU

```yaml

cpu:

1 core

```

---

## Memory

```yaml

memory:

512MB

```

---

## File Access

```yaml

filesystem:


allowed:

/workspace


denied:

/system

```

---

## Network

```yaml

network:

restricted

```

---

# 11. macOS Permission Mapping

AI Employee 需要映射 macOS 权限。

---

## File Access

使用：

```text

macOS Sandbox

+

Security Scoped Bookmark

```

---

用户授权：

```text

AI产品经理

请求访问：

/Documents/Product

```

---

用户：

允许。

系统保存：

Bookmark。

---

## Screen Recording

未来 Computer Use：

需要：

```text

Screen Recording Permission

```

---

MVP：

不申请。

---

## Accessibility

未来：

鼠标键盘控制。

需要：

```text

Accessibility Permission

```

---

MVP：

不申请。

---

# 12. Audit Log

所有关键动作记录。

---

Schema：

`audit_logs` 的 canonical schema 和追加写保留策略统一见 [[AI Employee OS Unified Data Model v1.0#4. Canonical SQLite DDL]]。

本 Architecture 负责权限判断、审批流程、Sandbox 与审计要求，不再维护独立建表定义。

---

示例：

```json

{

agent:

"Alex",


action:

"read_file",


resource:

"product.md",


result:

"allowed"

}

```

---

# 13. Security Observability

安全事件进入：

Observability。

例如：

```text

10:01

Alex requested:

read_file


10:02

Permission:

allowed


10:03

File read completed

```

---

# 14. Agent Trust Model

每个 AI 员工拥有：

Trust Level。

例如：

```text

New Agent

↓

Level 1


经过验证


↓

Level 2


企业批准


↓

Level 3

```

---

影响：

- 自动执行范围
    
- Tool权限
    
- Approval频率
    

---

# 15. Security 与 Agent Package

Agent Package 中声明：

```yaml

permissions:


requested:


- filesystem.read


- document.write


- browser.access

```

---

安装时：

用户确认：

```text

AI产品经理请求：

访问产品文件夹

允许？

[允许]

[拒绝]

```

---

# 16. Security 与 Skill

Skill 也声明权限。

例如：

视频生成 Skill：

```yaml

required_permissions:


- file.write

- network.access

```

---

安装：

检查：

```text

Skill需要网络权限。

是否授权？

```

---

# 17. MVP Security Scope

实现：

✅ Permission Gate

✅ Agent Permission

✅ Tool Permission

✅ File Scope

✅ Audit Log

✅ Human Approval基础版

---

暂缓：

⏸ 完整 Sandbox

⏸ 企业RBAC

⏸ Zero Trust

⏸ 密钥管理系统

---

# 18. 最终 Security Architecture

```text

                    AI Employee


                         |

                   Agent Runtime


                         |

                 Rust Security Kernel


       ┌──────────────┬──────────────┐


       |              |              |

 Permission       Approval       Audit

 Engine           Manager        Logger


       |

       |

    Tool Runtime


       |

    macOS System

```

---

# 当前 Security Architecture 版本

```text
AI Employee OS Security v1.0


Permission-first

+

Human-in-the-loop

+

Auditable Execution

+

Local Security Boundary

```

---
