# 彻底删除默认员工 Alex

## 目标

用户可彻底删除 `ai-product-manager`，删除后 bootstrap 不再复活；客户端不再硬编码依赖 Alex。

## 步骤

- [x] 路径确认：彻底删除且不再 bootstrap 复活
- [x] migration：`runtime_flags` 记录 `default_agent_dismissed`
- [x] `install_agent_package`：ON CONFLICT 不覆盖已有 `status`
- [x] `ensure_default_agent`：已 dismiss 则跳过；仅当 agent 不存在时安装
- [x] `employee_delete`：默认员工 purge 关联证据后硬删并写 dismiss；其他员工仅在有历史时停用
- [x] 客户端：默认选中第一个 active 员工，不假设 Alex
- [x] 清本地 DB（dev + Application Support）中的 Alex 并验证 list 不再种回
- [x] 更新检查脚本与测试（fresh / disabled 保留 / dismissed 不种回）

## Review

- 新装仍会 seed Alex；删除后 `default_agent_dismissed=1`，`employees-list` 不再种回
- disabled 后再 list（带 repository-root）不会被装回 active
- 本地两处 runtime.db 已删干净，列表为空且带 dismissed 标记
- 验证：`cargo test`、`scripts/check_employee_runtime.py`、`./scripts/check.sh` 通过
- 用户确认本地文件主路径已跑通；根文档已对齐：`local-file-operations` 为主验证，`web-search` 已合入但真实网络非默认门禁
- 用户下一步：通讯录新建员工，手动填 ID，绑定 Skill 后即可对话/工作
