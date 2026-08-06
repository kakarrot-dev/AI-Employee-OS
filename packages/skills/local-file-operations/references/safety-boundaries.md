# 安全边界

- 所有文件访问必须经过 Rust ToolExecutor 与授权目录校验。
- 不解析或绕过符号链接来逃逸授权目录。
- 不把 Secret、文件正文或绝对路径写入 Memory、Trace 或 Audit。
- 创建和编辑属于外部副作用，必须遵循审批、幂等与明确失败语义。
- 不用 shell 命令、任意脚本或覆盖写入替代受控 action。
