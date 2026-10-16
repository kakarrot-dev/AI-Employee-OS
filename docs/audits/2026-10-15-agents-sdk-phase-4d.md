# 4D：移除 DeepAgents 打包依赖与包内运行验收

日期：2026-10-15。**4D 的独立组装、离线记忆和包内 Runtime 门禁通过。** 未替换已安装客户端，未使用正式数据库，没有提交、推送、发布签名或公证。

前置：[自然路由修复与三组 Poe 重复验收](2026-10-15-supervisor-route-repair.md)。本阶段范围：[4D 契约](2026-10-15-agents-sdk-phase-4d-contract.md)；机器证据：[4D JSON](evidence/2026-10-15-agents-sdk-phase-4d.json)。

## 改动与兼容边界

- 生产资源组装不再安装、复制、导入 DeepAgents、LangChain、LangGraph Python 或 formal_worker；manifest 和 Python 组件清单同步删除。保留 spikes、旧虚拟环境、历史 Run、旧 checkpoint 与 SQLite 原文件。
- 记忆 Python 从已通过 uv locked/check 的实际环境读取 base prefix、ABI 与 site-packages，当前为 CPython 3.13.15；解除硬编码 3.12/3.14 混装。复制后通过隔离导入和依赖兼容检查，不引用源虚拟环境绝对 symlink。
- 固定模型来自显式输入缓存，复制前验证原固定 SHA-256，快照文件实体化并排除重复 HF blobs、锁文件。初始化改为查找实际 model_optimized.onnx，损坏源在写入用户缓存前拒绝，保留原子复制与重启补齐。真实模型已验证首次安装、重复启动不重写和中断恢复。
- 三个构建脚本共享 --release-root，实际产物置于 build/sdk-phase-4d/local-release；旧 build/local-release 的全部 3,441 个文件逐字节保留。缺模型等前置失败也验证不会删除已有输出。
- 修复旧 app-stage 没有随包携带外部文档解析器的问题。从当前锁定安装树复制 jszip、pdfjs-dist 及实际依赖闭包，共 16 个包；包含可用 optional native 包，.node/.dylib 在 ASAR 外保留。无另行安装或 package-lock 变更。
- Node 组件清单来自生产 dependency lock，剔除 dev-only 记录；包含声明的 optional 平台依赖。Python 清单来自候选实际环境，共 31 个包。此清单不是逐字节的全包软件物料审计。

Runtime 的任务、权限、审批、工具网关、SDK 子员工图、总管格式纠正、4B 零付费分派和历史恢复代码未在本阶段改动。最终 Runtime JS Hash 与路由修复门禁相同；原签名 helpers 字节不变。

## 真实资源与包内验证

候选完整 .app 复制到仓库之外再执行包内入口，避免 Node 向上查找开发目录依赖。使用相同版本的开发 Electron utilityProcess 承载包内 Runtime/Provider，Python、worker、三个 helpers、模型及 Node 文档解析器均来自候选；这是包内运行验收，不等于安装器升级或人工 GUI 验收。

1. 包内 Python 在 socket 禁网后加载真实固定模型，产生非零、有限的 512 维向量；使用明确的测试密钥在隔离数据库完成 AES-GCM 写入、读取、检索和作用域隔离，数据库未含测试正文，未调用 Keychain 或正式记忆库。
2. 包内自然语言任务完成双员工顺序协作、DOCX 提取、交接校验、一次写入与真实回读。只产生 2 个 Assignment，无员工返工。
3. 包内 SDK 待审批后 SIGKILL 并重启，原 Approval/Grant 保留、等待零调用；批准后写入一次并回读。拒绝无文件，取消无工具动作且下游保持 pending。
4. 旧 Runtime 与新版包内 Provider 先真实调用 Poe，生成非 SDK 待审批 Run；重启后由包内 Runtime 接管。Run、Revision、Grant、Approval 不变，等待零调用，批准后写入一次、回读并交付。旧 SQLite 合成哨兵 Hash 不变，不冒充真实 LangGraph 状态恢复。

| 包内场景 | 实际请求 | 确认 Token | 缺少 Usage |
| --- | ---: | ---: | ---: |
| 自然语言双员工 | 9 | 37,192 | 0 |
| SDK 审批重启恢复 | 5 | 17,715 | 0 |
| 拒绝审批 | 2 | 4,782 | 0 |
| 取消 | 1 | 未知 | 1 |
| 旧非 SDK 审批恢复 | 6 | 17,232 | 0 |
| 合计 | 23 | 76,921 | 1 |

所有收到的 Usage 与账本逐请求匹配；付费 manager_dispatch 为零。取消未知用量不记为免费，不估算美元或 Poe Points。本阶段删除的是包内无用依赖，未据此声称 Token 下降。

连同前置路由修复，本次用户请求共发出 **65 次 Provider execute，已确认 227,840 Token，另 4 次用量未知**。包括第一次 Schema HTTP 400、拒绝与取消，没有隐藏失败或仅统计成功样例。

## 候选、失败记录与保留

完整候选磁盘占用约 **726 MiB**，其中 runtime 约 **359 MiB**；原旧目录只有部分资源，不提供体积下降百分比。候选没有 DeepAgents 目录/worker 或对应 Python 发行包。发布签名、公证、安装器升级矩阵、GUI 人工验收与 DeepSeek SDK 实测仍不在本轮通过结论内。

打包保留三项中间失败：外部依赖遍历对 Node builtin 同名包 string_decoder 的查找问题（改按 package.json 查找）；默认 Electron 下载等待被中止，改用现有同版本 Electron 的本地归档；第一次归档带 AppleDouble 文件导致框架完整性签名失败，重新生成无扩展属性的归档后通过。均为构建诊断，没有产生 Poe 额外调用。packager 按默认 ASAR integrity 机制恢复候选 Electron Framework 的 ad-hoc 签名；源 Electron、原 helpers 和已安装客户端没有重签或替换。

后端 **421 项通过、3 项原有跳过、0 失败**，独立构建路径测试通过，Node/Web typecheck、直接 electron-vite build 与 diff 空白检查通过。最初 27 个用户文件、HEAD、暂存区、签名 helpers 与旧部分构建保持不变；当前全部未提交文件均先备份，仅扩展本轮相关代码和文档。没有创建新产品配置或第二套 Runtime。

原始报告、失败日志、复算脚本和仓库外候选位于本任务 sdk-migration/stage-4d-packaging。仓库内候选：build/sdk-phase-4d/local-release/dist/AI Employee OS-darwin-arm64/AI Employee OS.app。默认构建与显式模型输入说明见 README。
