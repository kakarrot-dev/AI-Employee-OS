# AI Employee OS Product Experience Design v1.0

目标：

把前面的技术架构转化为用户真正使用的 macOS 产品体验。

核心问题：

> 用户如何感知 AI 员工，而不是感知一个 Agent 系统？

产品原则：

> 用户管理的是“员工”，不是“模型”。

---

# 1. 产品体验核心模型

传统 AI：

```text
用户

↓

聊天框

↓

回答

```

AI Employee：

```text
用户

↓

员工组织

↓

分配任务

↓

员工执行

↓

查看成果

↓

培养员工

```

---

# 2. macOS App 信息架构

整体：

```text
AI Employee App


├── Home（工作台）

├── Employees（员工中心）

├── Tasks（任务中心）

├── Knowledge（知识中心）

├── Skills（技能中心）

├── Settings（设置）

```

---

# 3. 主界面设计

## Home：AI员工工作台

目标：

打开 App 第一眼：

看到：

> 我的 AI 员工正在做什么。

布局：

```text

------------------------------------------------

AI Employee


今天


🟢 Alex

AI产品经理


正在：

分析企业AI知识库需求


进度：

██████░░░░ 60%



🟢 Luna

AI运营


完成：

3篇内容方案


------------------------------------------------


输入任务：

@AI产品经理 帮我分析这个需求


------------------------------------------------

```

---

# 4. 首页核心入口

## 4.1 @员工输入

类似：

Slack / 飞书。

输入：

```text

@Alex

帮我分析这个需求

```

系统：

解析：

```text

Mention Resolver


↓

Agent ID:

product-manager

```

---

支持：

单员工：

```text

@产品经理

生成PRD

```

---

未来：

多员工：

```text

@产品经理 @设计师

一起规划首页改版

```

---

# 5. Employee Directory（AI员工通讯录）

这是核心页面。

不是：

机器人列表。

而是：

> AI 公司组织架构。

---

页面：

```text

我的AI员工


搜索员工...


-------------------


🟢 Alex

AI产品经理


职责：

需求分析

PRD设计


状态：

工作中



-------------------


🟢 Luna

AI运营


职责：

内容生产


状态：

空闲

```

---

# 6. Employee Card

卡片：

```text

头像

姓名

岗位


状态


当前任务


能力标签

```

---

例如：

```text

Alex


AI产品经理


🟢 Working


正在生成：

企业知识库PRD


能力：

PRD

竞品分析

用户研究


```

---

# 7. Employee Detail Page

这是 AI 员工最重要页面。

结构：

```text

Alex

AI产品经理


--------------------------------


基本信息


岗位：

产品经理


职责：

负责产品分析和设计


--------------------------------


能力


Skills:

✓ PRD生成

✓ 用户研究

✓ 竞品分析



Tools:

✓ 文件

✓ 浏览器

✓ 文档



--------------------------------


工作记录


今天：

完成：

PRD生成


历史：

128个任务


--------------------------------


表现


成功率：

94%


评分：

4.8


```

---

# 8. Chat Experience

聊天不是重点。

任务才是重点。

---

普通聊天：

```text

用户：

你好


Alex：

你好，我可以帮助你完成产品分析。

```

---

任务聊天：

```text

用户：

帮我分析这个需求。


Alex：

收到。

我会：

1. 分析用户问题

2. 查询产品资料

3. 输出需求文档


开始执行。

```

---

# 9. Agent Working Experience

这是区别 ChatGPT 的地方。

用户需要看到：

> AI员工正在工作。

---

状态：

```text

Alex 正在工作


✓ 已读取产品资料


✓ 已分析用户需求


⏳ 正在生成方案


```

---

不要展示：

模型思考过程。

展示：

行动状态。

---

# 10. Task Detail Page

每个任务：

独立空间。

例如：

```text

任务：

企业AI知识库需求分析


负责人：

Alex


状态：

Completed


耗时：

8分钟


结果：

PRD.md


评价：

4.8


```

---

# 11. Work History

员工成长必须可见。

页面：

```text

Alex 工作历史


2026-08-04


企业AI知识库PRD


状态：

完成


评分：

4.8



2026-08-03


竞品分析报告


评分：

4.6

```

---

# 12. Employee Management

用户可以：

管理 AI 员工。

---

## 创建员工

流程：

```text

创建AI员工


↓

选择岗位


↓

选择模板


↓

配置Persona


↓

安装Skill


↓

授权Tool


↓

完成

```

---

例如：

创建：

AI市场运营。

系统生成：

```text

Luna


Role:

Marketing Specialist


Skills:

内容策划

SEO


Tools:

Knowledge

Document

```

---

# 13. Employee Training

不是训练模型。

而是：

培养。

入口：

员工详情：

```text

培训Alex


添加技能


+ 用户研究高级Skill


+ 数据分析Skill


```

---

或者：

上传：

```text

公司产品手册.pdf


↓

Alex学习

```

---

# 14. Permission UX

用户不会看到复杂权限。

采用：

自然语言。

例如：

第一次：

```text

Alex需要访问：

产品资料文件夹


用途：

生成PRD


[允许]

[拒绝]

```

---

高级：

设置页：

```text

Alex权限


文件：

/Product


读 ✓

写 ✓


财务文件：

禁止

```

---

# 15. Knowledge Center

用户管理：

AI员工知识。

页面：

```text

知识库


公司资料


├── 产品文档

├── 用户反馈

├── 竞品资料


```

---

AI员工：

自动检索。

---

# 16. Skill Center

展示：

员工能力。

```text

Skills


PRD生成


版本：

1.0


适用：

产品经理


已安装：

Alex

```

---

# 17. Background Agent Experience

菜单栏：

```text

☁ AI Employee


Alex:

🟢 工作中


Luna:

⏰ 明天9点执行


```

---

点击：

打开：

工作台。

---

# 18. Notification Design

通知：

不是普通提醒。

类似员工汇报。

---

例如：

```text

Alex:


任务完成。


我完成了：

《企业AI知识库PRD》


发现：

竞品差异主要在知识检索体验。


查看报告 >

```

---

# 19. 用户心智模型

最终：

用户不是：

“调用AI”。

而是：

“管理AI员工”。

---

用户行为：

```text

招聘员工

↓

分配任务

↓

查看工作

↓

提供反馈

↓

员工成长

```

---

# 20. MVP 页面范围

必须实现：

## P0

### Home

✅ 员工状态

✅ 输入任务

### Employee Directory

✅ 员工列表

### Employee Detail

✅ 能力

✅ 历史

### Chat

✅ @员工

### Task Result

✅ 输出结果

---

## P1

增加：

- Skill管理
    
- Knowledge管理
    
- Permission UI
    
- Performance Dashboard
    

---

## P2

增加：

- 员工创建
    
- 员工培训
    
- 多Agent协作
    

---

# 21. 产品体验最终模型

```text

                AI Employee App


                       |

                 Employee Center


                       |

        ┌──────────────┼──────────────┐


        |              |              |

      Chat          Task          Profile


        |              |              |


        └──────────────┼──────────────┘


                    Agent Runtime


                       |


                 Work Result


                       |


                 Memory Growth

```

---

# 当前产品体验版本

```text
AI Employee OS Product Experience v1.0


核心体验：

不是聊天

而是：

管理 AI 员工 + 分配工作 + 查看成长

```

---

到这里，AI Employee OS 的完整设计体系已经覆盖：

1. 产品定位
    
2. 系统架构
    
3. Agent Runtime
    
4. Skill Runtime
    
5. Tool Runtime
    
6. Memory System
    
7. Security
    
8. Observability
    
9. Product Experience
    
