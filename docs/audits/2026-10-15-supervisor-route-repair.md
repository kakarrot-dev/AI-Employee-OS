# 自然路由空验收项：修复与重复验收

日期：2026-10-15。**路由修复门禁通过，随后进入 4D。** [契约](2026-10-15-supervisor-route-repair-contract.md)；[机器证据](evidence/2026-10-15-supervisor-route-repair.json)。

4C 原失败是完整终态，输出 261 Token，未达到 2,048 上限。扁平生成 Schema 没有按 mode 约束任务字段，允许 create_task 返回空 acceptanceCriteria；Runtime 正确拒绝后直接结束。已增加 mode 约束及显式提示，不补造占位验收项。Poe 首次拒绝并列 anyOf 对象约束（HTTP 400），已将 Provider 投影展开为互斥对象分支，保留平台原 Schema 和唯一性校验；失败原始响应保留，没有当成成功样例。

SDK 路由在创建任何任务前复用 SupervisorRouter 的纯格式校验；完整终态与真实 Usage 已收到而格式无效时，最多纠正一次。使用冻结的原请求、员工/专家团目录、授权目录、记忆与附件证据，不重新读取。纠正不得改变原 mode、已有员工顺序或 change 目标；网络、鉴权、工具或业务错误不重试。每次实际请求有独立 ID；会话保留原 ID，取消会中止当前实际调用。每次 Usage 独立落账，只有最终合法结果交给原任务入口。

新增失败回归先在旧实现复现：空验收项、纠正耗尽、改变业务选择、取消、异常工具、输入冻结和用量关联。修复后后端 **421 通过、3 原有跳过、0 失败**，Node/Web typecheck、直接 electron-vite build 通过。没有重建或重签 native helpers。

| 独立夹具 | 自然语言双员工：请求 / Token | 审批重启：请求 / Token |
| --- | ---: | ---: |
| natural-2 | 8 / 35,288 | 5 / 17,692 |
| natural-3 | 9 / 36,768 | 5 / 17,666 |
| natural-4 | 8 / 33,973 | — |

三组均保持指定两员工顺序，无员工返工，DOCX 提取、交接校验、创建一次与真实回读完成；每组只调用一次路由，没有触发纠正。纠正分支通过确定性失败回归验证，不冒充自然 Poe 触发记录。两组审批等待期间零模型调用，SIGKILL 后保留原 Grant/Approval，再批准并一次写入；两组拒绝无文件，两组取消无工具动作、下游未启动。付费 manager_dispatch 均为零。

含 HTTP 400 诊断、拒绝和取消在内，全轮 42 次真实 Provider execute，已确认 **150,919 Token**；HTTP 400 与两次取消共 3 次缺少 Usage，计费未知，不计为免费。三组自然语言成功合计 25 次请求、106,029 Token；不将输出长度波动归为架构节省，不估算美元或 Poe Points。所有收到的 Usage 都与账本逐请求一致。

本轮开始的 88 个未提交文件全部备份，原始 27 个用户文件逐字节保留，HEAD、暂存区和 native helpers 不变。原始报告与复算脚本位于本任务 sdk-migration/stage-route-repair，未使用正式数据库、替换安装应用或提交推送。
