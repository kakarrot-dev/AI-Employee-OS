# 4D：移除 DeepAgents 打包依赖与可运行资源验收

日期：2026-10-15。前置自然路由门禁通过：[路由修复验收](2026-10-15-supervisor-route-repair.md)。用户已授权在通过后进入本阶段；不安装或发布候选，不改正式数据库和凭证，不重建或重签 helpers。

## 范围及事实

Runtime、Main 与历史 Run 已在 4C 解除执行期 worker 依赖，SDK 图、任务、权限、审批与工具网关保持现状。本阶段仅处理生产资源组装、组件清单、模型初始化和独立候选打包，保留 spikes、旧 Python 环境、历史 Run、SQLite 和原有未提交修改。

当前组装器硬编码 3.14/3.12，而两个源虚拟环境实际均为 CPython 3.13.15；记忆环境已现场通过 uv sync --locked --dry-run --offline，无需变更，31 个安装包兼容。源 .model-cache 不存在；应用私有缓存中只读找到固定 bge-small-zh-v1.5 模型，SHA-256 与现有 Worker 固定值一致。旧 build/local-release 是部分产物，不可作为可用安装包大小基线。

## 实现边界

- 三个构建脚本接受同一个独立 release-root，限制在仓库 build 之下且 basename 为 local-release；实际使用新目录，默认旧目录不得在本轮运行中覆盖。源虚拟环境、模型、helpers 只读，未提交文件先备份。
- 组装只保留 local-memory Python/worker、三个原签名 helper 和固定模型。根据记忆虚拟环境读取真实解释器 base prefix、版本、ABI 与 site-packages；uv locked/check 验证源依赖，再复制匹配的独立 Python 和 site-packages。不能混装 ABI，不能复用源目录绝对 symlink；候选隔离 Python 必须能导入依赖且通过兼容性检查。
- 模型可从显式构建输入复制，校验已有 Worker 的固定模型 Hash，离线加载并产生 512 维向量；不将正式缓存作为输出、不改正式记忆。构建缺资源必须失败，不伪造“ready”。模型初始化按真实 model_optimized.onnx 文件定位及 Hash 校验，保留原子复制/重启恢复和缺损拒绝。
- Runtime manifest 与 Python 组件清单删除 DeepAgents；依赖版本和锁 Hash 来自实际资源。不更改 Node SDK 锁定版本。保留历史研究文件，避免按关键字删库。
- 在独立目录生成候选 .app，使用既有 Electron 与编译资源，不签名或替换已安装应用；包体数字只报告完整候选实测值，不拿旧部分目录作百分比比较。

## 验收门禁

先复现并保留模型初始化/构建失败，再做相关确定性回归。包内不得有 DeepAgents worker、Python、langchain/langgraph/deepagents Python 发行包；记忆模型 Hash、依赖/ABI、三个 helper Hash 和离线加密记忆增查验证通过。使用包内 Python、workers、helpers 和 Runtime entry，在隔离库启动；Poe 再验自然语言双员工、SDK 审批 SIGKILL 恢复、拒绝/取消，并把旧 Runtime 生成的实际待审批 Run 带入包内路径恢复，等待零调用、保留原 Grant/Revision/Approval、写入一次和回读。所有实际调用与 Token 逐请求对账，失败和未知 Usage 保留。

完成后跑相关后端测试、typecheck 和直接 build，核对工作区/HEAD/暂存区/native helpers、旧 build/local-release 与源环境保留。若任何资源或包内运行门禁未过，仅报告本阶段未通过，不推进下一阶段或宣称发布完成。

实现者可决定内部函数/测试夹具及资源路径参数名；复用现有资源逻辑，不新增产品权限、Runtime 状态机或模型配置来源。

只读 builder check：nothing important left。真实、Hash 正确的 model_optimized.onnx 已在独立目录复现旧初始化器的 hash_mismatch，原失败记录保留。

包内启动必要修复：当前 out/main/runtime 静态引用 jszip、pdfjs-dist，旧 app-stage 只复制 out 而无 node_modules。打包器需从现有锁定安装树复制这两个外部解析器的实际依赖闭包，保留嵌套解析和可用 optional native 依赖；不联网另装或改 package-lock。组件清单按生产 npm 锁记录与实际记忆 Python 生成，剔除 dev-only npm 记录。

实际封装说明：osxSign=false 保持无发布身份签名；packager 为 ASAR integrity 自动恢复候选 Electron Framework 的 ad-hoc 签名，未重签源 Electron、三个 helpers 或已安装应用。包内运行通过开发 Electron utilityProcess 承载候选入口，候选位于仓库之外以排除开发依赖回退；不将此表述为 GUI/安装升级验收。
