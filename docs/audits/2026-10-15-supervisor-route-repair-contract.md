# 自然路由空验收项修复与 4D 前置门禁

日期：2026-10-15。依据用户已授权的阶段迁移，本轮先修复路由，再通过重复 Poe 验收后推进 4D；不修改正式数据库或安装应用，不提交现有工作区。

## 事实与根因

4C 保留的失败响应为完整终态 JSON，输出仅 261 Token，未到 2,048 上限；create_task 的 goal 残缺、acceptanceCriteria=[]，员工顺序仍正确。生成 Schema 为兼容 direct_answer/ask_user 允许空任务字段，但没有按 mode 要求非空；Runtime 语义校验正确拒绝后直接结束，缺少创建任何 Task 前的格式纠正。不能归因于 Token 截断，不能由 Runtime 发明验收项或绕过校验。

## 本轮实现契约

- 保留原扁平路由协议、四种 mode、员工目录及业务校验。Schema 添加按 mode 区分的约束，create/change 必须有目标、至少一条验收项及员工，change 必须有 targetTaskId；direct/ask 必须有 response。提示明确任务模式不得用空数组，目标与验收简洁完整，不能复制附件长正文。
- SupervisorRouter 的现有纯格式校验供 SDK 执行层复用。完整终态且有真实 Usage 的响应通过格式校验后，才交给原 applyDecision；格式纠正不调用 TaskService 或工具。
- SDK Poe 路由最多一次纠正（总计两次模型调用）。纠正复用最初冻结的指令、员工/专家团目录、会话、授权目录和附件内容证据，不重新读取配置、记忆或附件；只附失败结果及格式约束。已识别的 mode、非空合法形状的员工顺序和 change 目标保持一致；改变这些业务选择则失败。不得静默添加占位验收项、扩大权限或启动员工。
- 每次真实请求具有独立 requestId；会话继续沿用原 UI requestId。真实 Usage 逐请求落账，失败调用也计入；只向会话提交最终合法结果一次。网络、鉴权、取消、异常工具或业务校验错误不作为格式问题重试。
- 取消按稳定会话 requestId 中止当前实际模型调用；纠正间隙取消也不能继续。失败两次则原错误结束，不创建草稿、Task、Assignment、Approval 或 ToolAction。
- 保留 Runtime 的任务、权限、审批、工具网关、SDK 子员工图与历史 checkpoint，不动既有 manager 格式纠正或 4B 零付费分派机制。DeepSeek 保持原路径，本轮不宣称其 SDK 实测通过。

## 验证与阶段推进

先将真实空验收响应保存为失败回归，再验证一次纠正、纠正耗尽、业务选择改变、取消、异常工具、真实请求 ID 与会话关联、四种 mode、未授权员工及缺目录门禁。运行相关后端测试、typecheck 与直接 electron-vite build，不重建或重签 native helpers。

真实 Poe 至少三组独立自然语言双员工任务，至少两组审批 SIGKILL 恢复，并验证拒绝和取消。每组必须顺序双员工、原工具网关、交接验证、写入一次、真实回读；审批等待零调用、原 Grant/Approval 保留。逐请求对账，列出包括失败、诊断及纠正在内的全部请求和实际 Token，未知用量单列，不以一例成功代替重复评估。

以上门禁通过后进入 4D：在独立构建目录裁剪 DeepAgents 打包依赖，修正已确认的 Python ABI 和缺模型构建问题，验证固定模型 Hash、离线记忆、包内启动与恢复；不覆盖现有 build/local-release。4D 具体实现契约在进入阶段时补充。

实现者可自行决定内部函数名、测试辅助与纠正文本；不得引入新产品配置、第二套任务运行时或无界重试。

只读 builder check：nothing important left。原始空验收输出与七项新增回归在修改前均已保存；当前实现受上述边界约束。
