# 4C：移除执行期 DeepAgents 与历史恢复验收

日期：2026-10-15。**Runtime 执行与历史恢复门禁通过；客户端全流程仍保留一次自然路由失败，未进入 4D。** 本阶段不宣称安装包已去除 DeepAgents，亦不宣称总体成功率、Token 或内存改善。

范围依据：[4C 契约与依赖盘点](2026-10-15-agents-sdk-phase-4c-contract.md)。机器证据：[4C JSON](evidence/2026-10-15-agents-sdk-phase-4c.json)。Task、Run、Revision、Grant、审批和工具网关继续由原 Runtime 控制，没有切换历史执行器或数据库 Schema。

## 剩余依赖与本轮处理

| 部位 | 现场确认的作用 | 处理结果 |
|---|---|---|
| Runtime 的 Python handoff 调用 | 用 FormalModel 复演已生成文本；不调用真实模型，不读取旧图状态 | 已删除调用，统一由 Runtime 校验保存的事实 |
| Main 启动参数、bundledRuntimePaths | 传入、探测及 chmod DeepAgents 路径 | 已移除；记忆服务和工具 helpers 继续必需 |
| SDK 子员工图与 native RunState | 实际员工执行、嵌套审批恢复 | SDK 0.20.0、图名、binding、原/新分派回执兼容不变 |
| 无 employeeExecutor 的 Run | 旧执行器，当前也包括 DeepSeek 新 Run | 保留原 TS Provider/工具循环；只替换最终交接校验，不启用 DeepSeek SDK |
| domain 与 Renderer 中的 deep_agents_safe_pause | 历史记录类型及时间线投影 | 保留可读；旧 checkpoint 不再绕过当前事实校验 |
| assemble_bundled_runtime、release metadata | 仍安装/导入 DeepAgents Python 并生成组件清单 | 保留，进入 4D 独立构建门禁 |
| spikes、uv.lock、Phase 0 检查、历史审计 | 研究复现与回滚材料 | 保留；不按字符串命中删除 |
| resource probe / 测试中的 Deep Agents 搜索词 | 调研工具测试数据 | 不是框架依赖，保留 |

旧 `formal_worker.py` 在运行前会 unlink 同 Run 的 SQLite，然后用假模型生成一个新暂停图。它并非任务、审批或真实模型上下文的恢复权威。移除它后，Run、Revision、Grant、Assignment、ToolAction、Handoff、Checkpoint 和 Delivery 仍是同一套事实源。

通用 `validateRuntimeHandoffs` 复用原 SDK 校验，覆盖冻结版本、Grant、顺序、接收者、Hash、已结算工具和同 Run 产物/证据引用。SDK 仍必须提供 typed envelope；只有无执行器的历史路径可按原 `output.text` SHA-256 读取 LegacyTextHandoff，不改写记录或补写 envelope。所有总管审核入口，包括恢复、分批审核和拒绝计划变更后的恢复，都先校验。旧文档末轮文本可为空，但必须保留已完成任务的草稿与 Runtime 工具事实；SDK 原要求不变。

## 移除两处恢复时的隐式升级

只读设计检查发现，旧启动代码会将非 v2 的待审批 Run 自动换成 full_access 新 Run，撤销原审批；另有恢复代码为旧小预算创建新 Revision/Grant，导致已保存 envelope 指向旧 Revision。

两条自动升级已删除。恢复保持原 Run、Revision、Grant、审批和预算；预算不足按原门禁失败，不自动放权或扩容。新任务和用户显式重试继续使用原产品入口，本阶段没有重做其整个策略设计。冻结格式纠正上下文仍复用原证据，不产生员工返工。

## Poe 历史兼容与计量修复

实际旧字符串请求两次返回 invalid_response。捕获的原始 HTTP 200 SSE 只有 `data:`，事件名在 JSON 的 type 字段中；旧解析器因缺少 `event:` 行跳过了正文、Usage 和终态。第二次原始终态可确认 1,494 Token，旧事件与账本没有收到它。

旧 Poe 字符串流现在复用已有 Responses 解析器。请求格式和授权保持原样，同时获得原有的 UTF-8/CRLF/EOF、完整终态、实际 call_id、精确工具名、Usage 与取消校验。没有放宽校验或增加重试。

逐请求核对还发现旧非 SDK 总管审核未写 BudgetLedger：保留的第一次成功兼容样例实际 17,158 Token，原账本仅 13,271，漏记审核 3,887。已统一总管 Usage 记录并按 requestId 去重，provider_step 保存实际 Provider/Model；历史回执优先使用冻结 reviewContext 中的请求。原漏记样例没有补写估算数据。

最终构建另行复测旧非 SDK Run：**6 次请求、17,294 Token，全部逐请求匹配账本**。新 SDK 的重复回调也只记一次。该修复不改变模型请求或员工执行。

## 真实运行证据

均使用隔离数据库、fixture 员工、生产工具实现和已有签名 helpers。未使用正式数据库、修改凭证或替换已安装客户端。

- 新 SDK 两个自然语言成功样例都完成两员工顺序执行、DOCX 读取、校验交接、文档创建和实际回读；每例仅 2 个 Assignment、3 项成功工具动作、一次写入，无员工返工。
- 最终构建的固定契约双员工任务、审批 SIGKILL 恢复、拒绝和取消全部通过。等待审批零调用，同 Approval/Grant，批准后写入一次；拒绝无文件，取消无工具动作且下游仍 pending。
- 非 SDK 兼容夹具先在旧 Runtime 启动后建立冻结实体，再由旧 Runtime 加新版 Provider 解析器真实调用 Poe，产生原待审批动作；SIGKILL 后切到最终新 Runtime。Run、Revision、Grant、Approval 不变，等待零调用，批准后写入一次、回读并交付。
- 旧 SQLite 的字节保留使用合成 SQLite 哨兵验证，不冒充真实 LangGraph 状态恢复。新版不读、不重建、不删除该文件，其 SHA-256 前后一致。LegacyTextHandoff 格式由确定性持久记录夹具验证，没有读取正式历史库。
- 更早的 SDK 无标签付费分派回执分别经完整 RunState、prepared-before-RunState 窗口恢复通过；旧账目保留，恢复不重新发出分派。SDK 图与回执三个实现文件和 4C 开始前逐字节相同。该两组实测使用记账修复前候选，最终构建另验证 SDK 控制场景与非 SDK 完整记账；所有构建 Hash 均保留在证据中。

## 调用数与 Token

下面自然语言样例包含会话路由；审批样例由固定任务契约启动。

| 场景 | 前请求数 | 后请求数 | 前实际 Token | 后实际 Token |
|---|---:|---:|---:|---:|
| 自然语言成功样例 1 | 9 | 9 | 36,854 | 36,403 |
| 自然语言成功样例 2 | 10 | 9 | 44,099 | 37,101 |
| 两个成功样例合计 | 19 | 18 | 80,953 | 73,504 |
| SDK 审批恢复 | 6 | 5 | 20,519 | 17,868 |

4B 的付费 manager_dispatch 在前后新 SDK Run 中均为 **0**。4C 删除的是不调用真实模型的 Python 复演。上述自然语言总量差异主要包含修改前多一次格式纠正（7,080 Token）及生成长度波动，不能归因于架构节省。

候选自然语言一共尝试 3 次：2 次成功，另 1 次输出 acceptanceCriteria 为空，被既有 invalid_supervisor_route 拒绝，未创建 Task 或执行工具。失败调用消耗 5,487 Token；计入它后，候选三次尝试总计 **19 次请求、78,991 Token**。该问题保留为客户端可靠性门禁，不能用成功样例替代全部尝试。

另保留一组取消探针脚本失败：函数抽取后工具变量超出作用域，实际没有发出取消命令，任务因此正常完成，产生 8 次请求、24,232 Token。该组不作为 Runtime 取消结论；脚本修正后的控制组及最终构建控制组均真实发出取消并验证通过。

本轮包含前后对照、历史兼容、诊断和重跑在内，共发送 **123 次 Provider execute 请求**。事件 Usage 合计 410,082 Token，加上旧解析失败原始响应中确认的 1,494，共确认 **411,576 Token**；另 4 次取消/旧解析失败请求的计费用量未知。未知部分没有记为免费，没有估算美元或 Poe Points。JSON 保留每个尝试、阶段、回执、缺失账目和原始路径。

## 验证、保留与下一门禁

先保留 Runtime 交接、旧 SSE 和旧总管漏记 Usage 的失败回归，再修复。最终后端 **412 项通过、3 项原有跳过、0 失败**；Node/Web typecheck、直接 electron-vite 构建和 diff 空白检查通过。没有重建或重签 native helpers。

本轮开始的 80 个未提交文件均已备份：10 个按本阶段目标扩展，其余 70 个字节一致；最初 27 个用户文件全部字节一致。HEAD、暂存区和 native helpers 不变，没有提交、推送或替换安装应用。同步修正了本地存储与恢复说明，未覆盖已有原型或架构文档修改。

最终 Runtime JS 为 2,686,343 字节，开始前为 2,697,027；仅为构建文件大小，不是安装包或内存收益。原始证据与复算脚本位于本任务 `sdk-migration/stage-4c-legacy-boundary/`。

下一阶段 4D 的范围须先解决：当前两个源虚拟环境都是 CPython 3.13.15，assembly 却读取 3.12/3.14 site-packages，固定模型缓存目录还不存在；现有 local-release 是部分产物。应在独立输出目录验证 ABI、锁定依赖、固定模型 Hash 与离线记忆，再移除 DeepAgents 打包和组件清单依赖，验证包内启动及历史恢复后才报告包体收益。自然路由空验收项需保留独立失败门禁；当前结果不等于客户端全量验收通过。
