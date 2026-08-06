# 工具库：说明文档 / 能力信息 / 权限与风险

## 目标

让 `file-tool`、`agent-reach-tool` 在工具库三个 Tab 展示真实、可读、与 manifest 一致的内容。

## 信息架构（已定设计）

| Tab | 回答什么 | 内容来源 |
|---|---|---|
| 说明文档 | 人话总览：用途、边界、依赖、审计原则 | 包内 `TOOL.md`（简体中文） |
| 能力信息 | 能调用哪些 Action、各自做什么、运行参数 | manifest `actions`；`agent-reach` 另附数据源状态 |
| 权限与风险 | 每个 Action 的权限、风险级、审批、副作用 | manifest 安全字段 |

## 实现步骤

- [x] 新增 `packages/tools/file-tool/TOOL.md`、`packages/tools/agent-reach-tool/TOOL.md`
- [x] `tools-list`：从 manifest 抽出 `actions`；有 `--repository-root` 时读 `TOOL.md` 进 `documentation`
- [x] Swift：`RuntimeToolItem` + `CapabilityStore` 映射三个 Tab；agent-reach 能力 Tab 叠加数据源
- [x] 同步 `CapabilityLibraryDemoData`
- [x] 中文摘要：客户端 `ToolPresentation` 映射（manifest description 保持英文给模型）
- [x] 跑相关检查

## Review

- 未改 ToolExecutor / 权限执行路径；仅扩展 `tools-list` 展示字段
- 验证：`cargo test`（rust-core）通过；`check_employee_runtime.py` 通过；Swift `ClientModelChecks` 通过
- 分发校验增加 `TOOL.md` 存在性检查
