# 4E：4D 候选的安装态与 GUI 回归契约

日期：2026-10-15。用户已授权本阶段回归和 Poe 实测，明确不替换正式客户端。基线为 4D 原始候选，不把开发 Electron 承载包内入口的旧证据充作本阶段 GUI 证据。

## 隔离与证据

本轮开始的 4,424 个未提交文件已记录 Hash，100 个源码/文档文件已另存完整副本；构建大文件只读保留，不覆盖旧目录。候选复制到新的独立应用目录，保留 .app、ASAR、Runtime、helpers Hash；使用候选自己的可执行文件启动 Main/Preload/Renderer 与两个 sidecar。先验证独立 user-data-dir，再启动业务代码；正式应用及数据目录不作为测试输入，不修改凭证、重建或重签 helpers。

GUI 交互使用原生自动化。用临时 localhost Main Inspector 只为核对路径及监听 Provider IPC 的实际请求、Usage、失败与取消，不向 Runtime 注入决策，不替代自然输入、附件选择、按钮确认或审批操作。原包文件保持不变；若要修复实际缺陷，先保留原候选失败证据和相关回归，再生成另一个候选，保留原包及全部修改。

已有只读凭证可用于 Poe；不重新保存或导出密钥。隔离夹具使用专用读取员、文档员、专家团和可验证 marker；不查询网络或操作外部联系人。自然任务受原 Main 授权规则约束，产物仅创建本轮唯一命名的本机验收文档，不覆盖现有文件。fixture 设置与真实 GUI 行为分开记录。

## 验收场景

| 场景 | 起点与 GUI 操作 | 期望与事实门禁 |
| --- | --- | --- |
| 安装态冷启动 | 从独立路径启动完整 .app；查看首页、连接/模型、通讯录、事项、用量 | Main/Preload/Renderer 无白屏，Runtime/Provider 就绪，私有模型初始化 Hash 正确；DB 和缓存落在独立 profile |
| 总管自然路由 | GUI 选择 Poe，总管会话输入自然语言，选择 DOCX 附件，提交双员工任务 | 验收项非空、两名冻结员工顺序正确，原 ToolGateway 读取/创建/回读，交接校验、一次写入、GUI 展示交付 |
| 重复协作 | 独立会话、唯一输出再次运行代表性任务 | 不以单例代替评估；无重复 Assignment/员工返工或付费 manager_dispatch；全部调用计入 |
| 正常重启 | 退出并重启候选，检查刚完成会话和事项 | 历史交付、附件、Hash、账本保留，闲置不新增付费调用 |
| 审批恢复 | 生成真正待审批的受管写入，GUI 观察；强制退出后用同 profile 重启，GUI 确认 | 原 Run/Revision/Grant/Approval 不变，批准前无文件、等待零调用；批准后写入一次并回读；若 GUI 无入口则按失败记录，不能用隐藏 IPC 代替 GUI 通过 |
| 拒绝/取消 | 可见审批卡拒绝，或会话运行中取消 | 无未授权写入、无下游继续执行，原审批状态与实际动作一致 |
| 用量 | GUI 用量页、Provider 实际回执与控制库逐请求核对 | 每次真实请求独立计数；失败/纠正/取消保留，未知 Usage 不计为免费，不估算币种或 Poe Points |

审批采用已有 Runtime 支持的 approval_required 本机文件夹具，避免创建真实会议或向外部人员发送邀请。夹具建立方式单列，不宣称自然语言默认权限策略发生变化。当前 UI 仅有会议审批组件的静态线索需现场确认，不能据此宣称本机文件 GUI 审批已通过。

不扩展产品权限、任务状态或 Provider，不推进正式替换、发布签名、公证或新的迁移阶段。完成时分别报告原 4D 候选、修复候选（如有）、GUI 结果、Runtime 事实、实际开销和剩余边界。

## 原 4D 安装态失败与必要修复

原 4D 候选已经分别在有/无 Inspector、LaunchServices 环境下失败；独立 CJS 导入探针捕获真实 Main 的 Cannot find module protobufjs/minimal，未发生 Poe 调用。当前封装器仅硬编码复制 jszip/pdfjs-dist 的闭包，遗漏打包后的 Main 中仍存在的 require；包内 Runtime 验证因此没有覆盖该 Main 依赖。修复应从实际编译 JS 的 import/export、字面量动态 import 和 require AST 收集外部包，跳过 Node/Electron 和相对文件，再复用原锁定安装树的闭包复制；不增加产品依赖或另行 npm install。可选 require 缺失必须单列，静态 ESM import 缺失失败关闭；源版本和 nested resolution 保持原树。先保存 original Main 导入失败及 scanner 回归，再构建独立 4E 修复候选；原包、原 4D 目录和所有修改保留。修复不改变 Runtime、权限或工具网关。

只读 builder check 已完成并落实：顶层 require2(protobufjs/minimal) 作为必需依赖，只有受 try/catch 保护的 require 才可列为 optional；保留完整 subpath 做解析验证，复制时才归一包根；候选 manifest 版本从实际 resolved package manifest 读取。

## 执行中确认的补充边界

安装态复现本机文档审批无 GUI 入口后，增加仅支持 document.create/read/edit 的业务确认卡，正文和修改前后文本按保留换行的纯文本展示。只绑定同一 Action 的 pending Approval，调用原 approveTool/rejectTool；终态任务、错配审批和未知 Tool 不提供确认入口。总管模型标签改用保存的 SupervisorConfiguration，说明已有 Run 继续使用冻结模型。上述修复不改变 Runtime 的权限或审批协议。

现有界面没有手动启动离线草稿的入口，也不提供 approval_required 的自然路由配置。因此审批夹具用原 TaskService 离线冻结单文档员 SDK Run，返回的请求不发送；实际安装态 Runtime 启动恢复后执行 Poe 并自行产生真正的 Approval。夹具建立和冻结不计作 GUI 发起或自然路由通过。首次恢复受到并行人工操作影响，保留费用和记录，不计作完整自动化通过；另建受控案例，由可见确认卡完成批准与拒绝。

最后一轮还复现了完成事件在列表读取期间被丢弃，Runtime 已交付而消息页仍显示进行中。补充门禁为：读取期间合并排队，旧请求结束后补读一次；补读期间再次到达的事件继续合并，卸载后不请求，成功后清理原失败重试。最终 Poe 案例提交后不切换会话、页面或触发焦点刷新，GUI 必须自行显示已交付。

执行结果见 2026-10-16-agents-sdk-phase-4e-installed-gui.md；本阶段不执行正式替换。
