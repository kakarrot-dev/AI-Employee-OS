# AI Employee OS 本地隐私说明

版本：v0.1
日期：2026-09-01

AI Employee OS 默认把产品数据库、任务、产物、诊断和加密记忆保存在当前 macOS 用户的应用数据目录。应用不会上传崩溃诊断、记忆数据库或本地文件。

只有以下明确动作会访问网络：用户配置并调用已验证的 DeepSeek/Poe 模型；用户批准受管 GitHub/RSS ToolAction；用户主动执行来源健康检查。每次正式 ToolAction 仍受 RunGrant、参数来源、Origin、风险和逐次审批约束。Poe 未配置 Credential 时不会调用；当前只允许 `claude-sonnet-4.6`、`gpt-image-2`、`seedance-2.0`。

API Key 保存在 macOS Keychain，不进入产品数据库、日志、任务、记忆、导出或 Worker 环境。记忆正文与向量以 AES-256-GCM 加密；未经用户单独授权，待提取内容只进入本地加密队列，不发送给云端记忆处理模型。

“永久删除”覆盖应用管理的当前记录、历史版本、索引、关联队列和可还原 SQLite 页；用户自行创建的 Time Machine、磁盘镜像、复制文件及其他外部备份不在应用可验证范围内。卸载 `.app` 不会自动删除应用数据或 Keychain 项，避免误删；用户应先导出需要保留的产物，再按文档执行数据清理。

崩溃诊断默认只保存在本机并脱敏，不包含 Credential、记忆正文、完整 Prompt 或外部响应正文。任何未来的诊断上传功能都必须逐次展示内容并取得明确授权。
