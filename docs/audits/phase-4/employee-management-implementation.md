# Phase 4：Agent 员工管理实施验收

版本：v0.1
日期：2026-08-31
状态：完成

## 1. 结论

“团队”模块已从空壳接入 Local Control Runtime 事实源，覆盖 Agent 员工列表、分步创建、详情、编辑、真实 Sandbox 测试、用户确认、发布、不可变版本、回滚、任务引用、停用、归档、恢复和受约束删除。客户端不维护第二套员工生命周期状态。

首个真实员工使用 `deepseek-v4-pro` 完成 `TestCase → SandboxTestRun → 自动验收 → 用户确认 → 发布` 闭环；Electron 重启后仍读取同一个可工作版本和已确认测试记录。

## 2. 数据契约与生命周期

Runtime 新增以下实体：

- `Employee`：可变聚合根，只保存当前工作版本、草稿版本、停用与归档指针；
- `EmployeeVersion`：草稿期间可自动保存，发布时转为数据库强制不可变快照；
- `AgentCapabilityVersion`：随客户端安装的只读不可变能力定义；
- `TestCase`：用户维护的代表性 Prompt、验收标准和可选精确包含条件；
- `SandboxTestRun`：记录实际模型输出、Provider Usage、自动验收、用户确认和失败码。

已发布版本不会被编辑覆盖。编辑工作版本会复制出下一版本草稿，旧版本继续被历史 Assignment 引用。草稿任一配置变化都会清空当前有效 TestRun 引用；旧确认记录不能再次解锁发布。

状态由 Runtime 投影为：草稿、待测试、可工作、已停用和已归档。活动版本存在时员工继续显示“可工作”；另存草稿的保存、测试和发布进度属于版本维度，不再混入员工可用状态。回滚只允许指向已经发布且有确认测试的历史版本，并重新检查能力依赖。

## 3. 分步界面

创建/编辑采用七步连续流程：

1. 基本资料
2. System Prompt
3. 模型配置
4. Agent 能力
5. 记忆范围
6. 测试
7. 确认

每次“保存并继续”由 Runtime 自动保存草稿。右侧持续展示四层 System Prompt 预览：平台安全层、员工定义层、能力层和运行上下文层；平台约束与 Runtime 上下文不会被复制进可编辑 Prompt。

员工详情同时展示版本、正式 Assignment 引用及治理动作。有工作版本或正式引用的员工不出现物理删除入口，只能停用或归档；从未发布且没有正式引用的草稿可彻底删除。

## 4. 能力目录与依赖传播

当前只读目录内置两个版本化能力：

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| `capability.text-analysis.v1` | 可用 | 无 Tool/MCP 副作用依赖，可用于本阶段真实测试 |
| `capability.managed-research.v1` | 不可用 | 依赖 Phase 6 的 GitHub/RSS 受管 Tool |

不可用依赖可以在草稿中查看，但会阻止 Sandbox Test、发布和正式版本可用性检查。Phase 5 创建 Assignment 时必须调用同一个 `assertVersionUsable` 门禁，不能只相信客户端显示状态。

## 5. Sandbox 测试边界

- 使用员工当前草稿的真实 System Prompt、精确模型、能力依赖和测试 Prompt；
- 通过 Phase 3 Provider Service 调用模型，Renderer 和 Runtime 不读取 API Key；
- 测试输出和 Usage 保存在 SandboxTestRun，不进入正式 Task、Run 或记忆；
- 自动验收通过后仍需用户明确确认，未确认不能发布；
- 测试失败、Provider 不可用或能力依赖不可用都保持草稿状态。

真实闭环结果：`deepseek-v4-pro` 返回包含 `PHASE4_OK` 的预期输出，Sandbox TestRun 状态为 `completed`，`automaticPassed=true`，Usage 来源为 `provider_actual`；用户确认后员工发布为 `active`。重启后 activeVersionId、1 个不可变版本和 1 个已确认 TestRun 均恢复，Runtime Schema v2、事件游标 17。

## 6. 自动化与真实验证

自动化覆盖：

- 未测试员工拒绝发布；
- 真正完成且用户确认的 Sandbox 测试允许发布；
- 编辑已发布员工产生 v2 草稿，v1 保持不可变；
- v2 发布与已测试历史版本回滚；
- 停用版本拒绝进入正式运行；
- Tool 依赖不可用阻止测试；
- 配置变化使旧确认测试失效；
- 正式 Assignment 引用阻止物理删除；
- 归档恢复后保持停用并要求重新测试；
- 七步表单与持续 Prompt 预览存在。

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

完整结果：8 个测试文件、28 个测试通过；TypeScript、生产构建和 Diff 空白检查通过。真实 Electron/CDP 另验证：团队页面能读取员工、创建入口和能力入口；Employee Bridge 只有 16 个显式方法；Renderer 中 `process` 与 `require` 均不可见。真实验收数据库 `PRAGMA quick_check=ok`，Entity JSON 对 `credential`、`authorization`、`api_key` 的匹配数为 0。

## 7. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| 新员工未测试不能发布 | 通过 |
| 修改已发布员工不影响旧 Run | 通过：新草稿与旧不可变版本分离；Assignment 继续引用版本 ID |
| 不可用 Tool/MCP 阻止关联员工进入正式任务 | 通过：阻止测试/发布，并提供 Phase 5 共用的版本可用性门禁 |
| 有历史引用的员工不能物理删除 | 通过 |

Phase 4 完成，可以进入 Phase 5 Deep Agents 正式任务闭环。
