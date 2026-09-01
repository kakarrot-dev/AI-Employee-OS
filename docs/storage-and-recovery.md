# 本地存储、备份与恢复

版本：v0.1
日期：2026-09-01

## 目录

应用数据位于 `~/Library/Application Support/AI Employee OS/`：

- `runtime/control.sqlite3`：产品事实源与追加审计；
- `runtime/checkpoints/`：Deep Agents 持久 Checkpoint；
- `memory/memory.sqlite`：加密记忆、向量、队列与墓碑；
- `memory/model-cache/`：固定 Embedding 模型缓存，可重建；
- `exports/`：用户交付产物；
- `diagnostics/`：本地脱敏崩溃诊断。

首次启动会在私有目录中完成 Schema Migration，并从应用内固定资源安装已校验的 Embedding 模型；中断后下次启动按文件 Hash 补齐，不覆盖已完成文件。模型缓存可以清理并从应用资源恢复，产品数据库、记忆和产物不得作为缓存删除。

## 配额与保留

- 模型缓存软上限 512 MiB，只允许清理不属于固定模型清单的缓存文件；
- 本地诊断软上限 20 MiB，保留最近 14 天和最多 20 份；
- 导出、数据库、Checkpoint 和加密记忆不自动按时间删除；
- 磁盘空间不足时停止新增缓存或导出并报告，不能删除事实源换取空间。

## 备份与升级

退出应用后备份整个应用数据目录，才能同时保留数据库、WAL、Checkpoint、记忆和导出。升级时数据库 Migration 必须先备份、在事务中执行并保留旧版本可读副本；失败时继续使用原数据库，不得半迁移。当前本地无签名版本验证同版本重启和崩溃恢复；跨版本安装器回滚、Apple 签名升级与公证尚未验证。

## 卸载与删除

把 `.app` 移到废纸篓只删除程序，不删除应用数据或 Keychain。若要彻底清理，应先退出应用并备份需要的导出，再删除上述应用数据目录；Keychain 中 `com.kakarrot.ai-employee-os.*` 项须由用户在“钥匙串访问”中核对后单独删除。不要用模糊通配符批量删除 Keychain 或用户目录。
