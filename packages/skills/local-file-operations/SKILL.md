---
name: local-file-operations
description: Read, create, and precisely edit authorized local UTF-8 files. Use when the user asks to inspect, generate, save, or modify a file in an allowed directory.
---

# 本地文件操作

根据用户目标与上下文理解要执行的文件操作，不使用关键词条件表替代模型判断。

调用对应 Tool：

- 读取文件：`file-tool.read_file`
- 创建文件：`file-tool.create_file`
- 精确编辑：`file-tool.edit_file`

信息不足时返回 `ask_user`。不得猜测路径或内容，不得访问授权目录外的路径，也不得用覆盖写入绕过文件已存在或旧文本不唯一等冲突。

执行前阅读 [操作契约](references/operation-contracts.md) 与 [安全边界](references/safety-boundaries.md)。
