# 第四阶段 4A：SDK 交接路径解除 DeepAgents worker 依赖

用户已授权本阶段：Poe 优先；Runtime 继续拥有任务、权限、审批和工具网关；保留历史 Run 兼容及所有未提交修改。范围仅为 4A，性能优化、安装替换、全局旧依赖删除属于后续阶段。

## 已核实事实与实施选择

`formal_worker.py` 使用固定 FormalModel 重放一段既有输出，检查根工具只有 task、员工只有提案工具、图停在 model 边界，再写独立 LangGraph SQLite；不调用真实模型，也不验证业务交付。真正的 HandoffEnvelope、内容 SHA-256、接收方、Artifact/Evidence 引用和工具结果校验已由 TypeScript Runtime 执行。

本阶段直接复用 Runtime 的交接契约，对 `openai-agents-ts-v1/v2` 增加无网络、无工具副作用的交接验证记录；不伪造旧 DeepAgents 图状态。缺少 executor 的历史 Run 继续使用原 Python worker，原 checkpoint 和旧 Handoff 数据不改写。

## 不变量与调用路径

1. SDK 校验读取已保存的 Run、冻结 TaskRevision/RunGrant、Assignment、Handoff、工具动作和证据；校验员工归属、顺序、完成状态、授权范围、Envelope 哈希及接收方、引用证据。缺失/损坏/越权交接拒绝进入总管审核；业务证据与交付门禁仍由原 TaskService 执行。
2. SDK 记录 `handoff_validated` 检查点，绑定 revision、grant、assignment、handoff 哈希与已结算工具；写入使用现有 SQLite 事务。重复校验复用相同证据，返工后必须形成对应新交接证据。
3. 校验收敛到 TaskService.startManagerReview，覆盖普通审核、长文档分批审核、拒绝计划变更和应用重启恢复；启动扫描仍逐 Run 检查。恢复中的旧 SDK Run 可直接生成 TypeScript 校验记录；不能因为旧 deep_agents_safe_pause 存在而调用 Python。非 SDK 历史 Run 保持原路径。
4. SDK 启动和执行不要求 DeepAgents Python/worker 文件存在：worker 参数延迟到旧路径使用时读取；打包资源检查只对旧 worker 延迟验证。记忆服务及其他必需资源的检查保持原语义。兼容代码、worker 和打包依赖本阶段保留。
5. 所有模型请求、审批、实际工具调用、幂等与未知结果恢复仍沿用第三阶段实现。无新 Provider、权限、工具旁路或模型裁判。
6. 旧 Handoff 的受众只校验生成时已有成员，不按返工后的成员全集重算。Runtime 创建的返工员工可继承同 Run、同员工版本的原 Assignment 接收权限，不能任意指定受众。SDK 拒绝变更后的下游输入复用已校验的累积 Handoff，保留结构化内容。Teams 历史工具回执继续由原任务血缘和业务证据策略管理。

## 验收

- 确定性：有效文本/结构化/引用交接；篡改哈希；跨 Run/Revision/员工/接收方；缺少交接或引用证据；未结算动作；返工和重复校验；v1/v2 与历史 worker 分流；旧 checkpoint 兼容。
- 启动：缺少 DeepAgents 文件/参数仍能启动 SDK Runtime；历史路径配置完整时执行原 worker，缺失时明确失败。
- 真实 Electron + Poe：使用独立 fixture 数据库，在 worker 不可用的条件下完成双员工源读取、文档写入与回读、总管交付；审批点 SIGKILL 后保持同一 Approval/Grant，等待时无模型调用，批准只写一次；拒绝不写入。额外验证交接完成但检查点未写入时的恢复。
- 类型检查、相关后台测试、Electron Vite 构建；不重建已有签名凭据 helper，不操作生产数据库或已安装客户端。
- 本轮 64 个未提交文件已保存 SHA-256 基线与 diff。仅扩展直接相关文件，其余逐一保持字节一致；HEAD、暂存区保持不变，不提交或推送。
