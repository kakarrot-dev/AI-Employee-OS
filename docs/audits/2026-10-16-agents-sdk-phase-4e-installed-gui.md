# 4E：安装态与 GUI 回归结果

开始于 2026-10-15，完成于 2026-10-16。**原 4D 候选未通过完整客户端冷启动；本阶段修复候选通过 Poe 安装态业务门禁。正式客户端未替换，原有未提交修改、旧候选和失败证据均保留。**

## 最终候选与隔离

候选：`/Users/kakarrot/Applications/AI Employee OS 4E Regression Candidate.app`。实际运行其可执行文件和 app.asar，isPackaged=true。实际 userData/sessionData 均为本轮独立的 stage-4e-installed-gui/profile-gui；Runtime、Provider、Python 与原签名 helpers 均来自候选资源。未使用正式数据库，未重新保存或导出凭证，未重建或重签 helpers。产物仅在下载目录以本轮唯一名称独占创建。

| 项目 | 已核对事实 |
| --- | --- |
| 最终 ASAR SHA-256 | `669ed6e0bc270ab16b7ef99a269a264135c923d78ea891a05d2467617f9c0669` |
| Runtime SHA-256 | `627925f71e75c130fb8f3732787f0a8931aed1cc36218a951d1551b3de0757ba`，与原 4D 一致 |
| Main / Provider / Preload | 包内对应入口与原 4D 逐文件 Hash 一致 |
| 外部依赖根 | jszip 3.10.1、pdfjs-dist 6.3.289、protobufjs 7.6.6；沿用锁定树，共复制 29 个实际包 |
| runtime 资源 | 仅 local-memory 和 runtime-manifest.json，未增加 DeepAgents worker |
| 执行框架 | OpenAI Agents SDK TS 0.20.0；实际 Run 为 openai-agents-ts-v2 |
| Provider | 全部业务请求为 Poe claude-sonnet-4.6 |

本阶段只修改封装依赖和 Renderer。任务、冻结 Revision/Grant、审批、工具网关、SDK 子员工图和检查点均仍由原 Runtime 管理。

## 复现的问题与必要修复

1. **Main 缺少 protobufjs/minimal。** 原包有/无 Inspector、LaunchServices 冷启动均未进入业务初始化；导入探针捕获必需模块缺失，期间零 Poe 请求。原封装器只列举两个包，遗漏 vendor ESM 的 createRequire。现在从实际编译 JS 的 import/export、字面量动态 import/require AST 盘点依赖，保留完整 subpath 解析，必需依赖缺失立即失败，可选缺失单列，并复用原复制闭包。未另行安装产品依赖。
2. **文件审批没有 GUI 入口。** Runtime 已真实生成待审批写入及 SDK 暂停状态，界面却只支持会议审批，还误提示核对会议名单。新增本机文档新建、读取、精确修改确认卡，展示精确路径和纯文本内容，只调用原 approveTool/rejectTool。错配审批、终态任务、已结束动作、未知工具、重复点击及 HTML/Markdown 原文展示均有回归。
3. **模型标签写死为 DeepSeek。** 实际配置和请求已为 Poe。标签与勾选改为读取保存的总管配置；面板说明模型在总管设置修改，已有 Run 使用冻结配置，不新增会话级切换协议。
4. **完成事件可能丢失。** 案例 C 已在 Runtime 交付，GUI 却长期停在“进行中 8 秒”。原刷新函数丢弃读取期间的事件。现在合并为后续补读，保留卸载保护及失败重试清理。真实失败和确定性失败测试均已留存；修复候选的案例 D 无需导航或焦点刷新即可自动显示交付。

变更集中在封装脚本、package_dependencies 及测试，以及 Renderer App、LocalDocumentActions 和相关测试。没有修改 Runtime/Provider 执行、权限或历史兼容协议。

## Poe 与 GUI 实测

自然案例由 GUI 输入自然语言、原生文件选择器导入 DOCX；总管自行生成验收项和团队顺序。读取员仅有附件读取能力，文档员仅有本机文档能力。未使用网络检索、联系人或会议工具。

| 案例 | 实际业务请求 | 实际 Token | 验收结果 |
| --- | ---: | ---: | --- |
| 自然协作 A | 9 | 38,981 | 6/6；读取、交接、一次创建、回读及 GUI 交付 |
| 自然协作 B | 10 | 47,761 | 6/6；一次格式纠正，员工与工具未返工 |
| 首次审批恢复 | 5 | 18,556 | 最终交付；受并行人工点击影响，计入费用，不作为完整自动化证据 |
| 受控审批恢复 | 5 | 17,745 | 等待、崩溃恢复、GUI 批准写入与回读、最终交付 |
| GUI 拒绝 | 2 | 5,046 | rejected/blocked；未开始执行、未创建文件、无后续模型调用 |
| 自然协作 C | 10 | 45,039 | 5/5；Runtime 与磁盘通过，旧 GUI 刷新失败，保留失败并由 D 复验 |
| 自然协作 D | 10 | 47,128 | 7/7；最终候选自动显示完成状态与交付卡 |
| **合计** | **51** | **220,256** | **203,993 输入 + 16,263 输出**；GUI、Provider 与账本一致 |

四轮自然案例均只有两条 Assignment、一次附件提取、一次新建、一次回读，没有员工返工 Assignment。每个成功文件的写入结果、回读结果与实际磁盘 SHA-256 一致，均包含 amber_orchid。本轮共 6 个文件，被拒绝的文件不存在；每条成功 Run 都有 Runtime 交接验证记录。

受控样例重启后等待 **48.65 秒，新增模型请求为 0、目标文件不存在**；原 Revision、Grant、Action、Approval 均不变。随后通过可见 GUI 卡片批准原写入，再批准回读，写入只执行一次。另一条恢复后的原审批通过 GUI 拒绝，未产生文件。

3 次总管格式纠正均复用相同 evidenceSha256 和 Assignment 集，没有重做工具。实际付费 manager_dispatch 为 **0**，仍由 Runtime 推进冻结计划中的 SDK 子员工图。输入和纠正次数不同，本轮不宣称相对旧版节省百分比。

另有 **1 次显式 Poe 模型连接验证**。当前 verifyModel 使用真实 Adapter，但不向账本输出 Usage，因此该次 Token 未知，不能算免费。本轮实际调用 **52 次**，已知业务 Token 为 220,256；Poe Points/币种费用未由服务返回，GUI 显示“模型服务未提供”。

## 正常退出、重启与确定性检查

最终候选通过原生菜单 Quit 退出，Main exit code=0、signal=null；随后从独立路径重启。最后一次交付、附件与完成状态可见，冻结 Revision/Grant、审批、动作、交付和账本逐条保持一致。重启闲置新增请求为 0。

交付前再次正常退出并停止临时观察器，以同一独立 profile、无 Inspector/IPC 观察器的方式重开候选；候选保持打开供查看。观察代码未写入客户端安装包。

| 检查 | 结果 |
| --- | --- |
| Runtime / Provider / Main / Shared | 421 通过，3 跳过 |
| App / LocalDocumentActions / MeetingActions | 71 通过 |
| 依赖盘点与隔离构建路径 | 5 通过 |
| TypeScript 类型检查、electron-vite 完整构建 | 通过；未运行会重建 native helpers 的总构建流程 |
| 安装态机器门禁 acceptance.py | 通过；Provider 回执与账本逐请求一致 |

锁屏后按系统工具要求等待用户手动解锁，未绕过认证。一次切换候选时我过早启动了新进程，短时共用测试 profile；期间没有活跃 Run、没有模型请求，随后只停止旧候选。该切换留存记录，不作正常退出通过证据；最终已单独复验菜单正常退出与重启。

## 保留与边界

入口时 4,424 个未提交文件没有删除，仅对其中的封装脚本作必要修改，完整修改前副本仍保留。迁移最初的 27 个用户文件逐一 Hash 不变；native helpers、HEAD、Git index 不变；没有提交或推送。原 4D 构建、安装失败候选、中间候选和失败证据均保留。

审批夹具由原 TaskService 离线建立并冻结单员工 approval_required Run，返回请求不发送；实际安装态 Runtime 启动恢复后经 Poe 自行产生真实审批。夹具准备不冒充 GUI 发起或自然权限选择，也没有修改默认 full_access 策略。GUI 历史回归覆盖本轮 SDK Run，没有导入正式历史库。原 4D 的 legacy Run 兼容证据保留，本阶段后端字节一致。

本阶段通过 **Poe 隔离候选业务门禁**，未执行 DeepSeek SDK 门禁、正式发布签名/公证或正式替换。拒绝动作沿用 Runtime failed 事项投影，GUI 仍显示通用失败说明；rejected/blocked、零写入已有独立证据，后续可改善文案，不以此改变状态或权限。

## 证据

证据根：`/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui`。

- [机器门禁与逐案例开销](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/evidence.json)
- [最终自动交付 GUI](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/refresh-final-completed.png)
- [最终 7/7 验收项](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/refresh-final-acceptance.png)
- [GUI 用量](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/final-usage.png)
- [恢复后的原审批](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/controlled-write-after-restart.png)
- [包内后端 Hash](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/final-package-integrity.json)
- [未提交修改保留检查](/Users/kakarrot/.codex/visualizations/2026/10/15/01a13d3b-1b5a-7592-972c-dd223631304a/sdk-migration/stage-4e-installed-gui/preservation.json)
