# Phase 8：主验收场景实施验收

版本：v0.1
日期：2026-09-01
状态：本地运行边界完成

## 1. 结论

真实 Electron 场景已使用两个经 DeepSeek `deepseek-v4-pro` Sandbox Test、用户确认并发布的不可变 EmployeeVersion，完成“网络调研员 → ResearchHandoff → 调研分析师 → 总管审核 → Delivery”串行闭环。运行期间只批准了精确的 `github.repositories.search@research-source/v1` 与 `rss.read@research-source/v1` 两次低风险只读 Proposal；员工不能重复同一 Tool、改变目标、扩大 RunGrant 或直接执行 Tool。

最终 Task `d6bc733f-ff70-4fee-a2a7-5a3747651e5f` 与 Run `4665705e-0bc7-4d66-9114-c6fe1e18fd4c` 成功，ResearchBundle 保存 4 个来源、4 条低置信 Claim、冲突/缺口数组与内容 Hash；分析师请求不含 Tool，只接收 ResearchHandoff 事实投影。总管批准后，Runtime 原子导出 Markdown 与 JSON 来源清单，生成 2 个 Artifact、4 条 Evidence，并将实际文件 SHA-256 回读为数据库记录值。

## 2. 编排与授权

- Proposal turn 使用 `tool_choice=required`，最终研究结论和分析师 turn 使用 `tool_choice=none`。
- 每个 Assignment 维护剩余 ToolVersion；同一 Assignment 内已经落账的 Tool 不可再次提交。
- Tool 参数 Schema、参数来源、RunGrant、Origin、风险和审批逐层校验；两次真实批准的参数分别为 `query=deep agents, limit=2` 与 `url=https://github.blog/feed/, limit=2`。
- 所有 ToolResult 作为 `untrusted_external_content` 数据进入后续模型；注入信号只能成为风险证据，不能成为指令。
- 后续员工只接收 ResearchHandoff 中的来源投影、Claim、冲突、缺口、Hash 和研究员综合，不获得 Tool、原始 Credential 或任意外部访问能力。

## 3. ResearchBundle 与交付

真实 ResearchBundle：

- ID：`94d6bb00c43f9e004452df7269f7d14357ce945fcc0dd28946b7a087f656db1e`
- Content Hash：`ddefd49df37aacc9def07c4d98e3edded6aacebf410518ff35d7520ab43d8a01`
- 来源：2 个 GitHub Repository、2 个 RSS/Atom Item
- Claim：4 条，均保留来源索引和 `low` 置信度
- 冲突与失败缺口：本次成功样本为空数组；确定性测试另覆盖同名异 Hash 冲突、失败来源和提示注入信号

交付器在应用私有 `exports` 目录先写同目录临时文件，再以硬链接原子占位；任何同名文件使用最小 `_1`、`_2` 后缀，禁止覆盖。真实文件回读结果：

| 类型 | SHA-256 |
| --- | --- |
| Markdown | `e569f5160027bf8bb9a818c7f3e036ead4880bc8134768141615294248e6a199` |
| JSON 来源清单 | `0ff743df4418993a1ed9fd4af15d2c568db6ac86aac2350e3059cf364221b944` |

## 4. 总管审核与返工

DeepSeek `/responses` 当前接受 `text.format.type=json_schema`、`name` 和 `schema`，不接受适配器原样透传的内部 `strict` 字段；真实经理请求曾因此得到 HTTP 400。修复后 `strict` 只保留为本地契约，线上载荷不再发送该字段。

经理审核会同时看到 ResearchBundle 最小投影和“审核通过后由 Runtime 生成 MD/JSON”的后置交付契约，不能因审核时文件尚未生成而形成循环拒绝。若经理退回上游 Assignment，Runtime 按原顺序级联创建上游及其下游返工 Assignment，继续使用原不可变 EmployeeVersion；最多允许两个返工 Assignment，超限显式失败，不交付旧下游结果。

## 5. 记忆边界

成功任务正文已由独立 Memory worker 异步写入 AES-256-GCM 加密队列，Queue Item `3b79609e-50d5-4fa6-89c5-3686afe6faaf` 的状态为 `pending_authorization`。用户尚未单独授权记忆处理 Provider，因此本场景不把正文自动分类为事实/经验，也不声称已经被后续任务语义召回；这是产品规格的数据出口门禁，不是静默降级。Phase 7 已用确定性案例验证分类记忆的 Scope 约束召回，待用户授权后再执行本队列的真实提取与后续任务召回。

## 6. 验证

```bash
npm test
npm run build
git diff --check
```

确定性门禁覆盖完整主链、两类来源、提示注入、来源失败、同名导出、经理返工级联、DeepSeek Structured Output 线协议和失败事件背压。真实 Electron + CDP 验证任务终态、ResearchBundle、Artifact/Evidence UI 投影与 Memory Queue；Renderer 中 `process`、`require` 均为 `undefined`。

Phase 8 在“本地运行、无 Poe Credential、未授权云端记忆提取”的明确边界内完成，可以进入 Phase 9 本地无签名打包。Apple Developer ID、Provisioning Profile、Keychain Access Group 和公证仍未提供，不能声称发布候选已签名或可公开分发。
