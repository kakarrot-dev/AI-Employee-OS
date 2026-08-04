# Release 1：Decision Substrate

## 目标

让每次 Agent 决策都能回答四个问题：使用了哪个 Prompt、装配了哪些 Context、引用了哪些 Knowledge、读取和写入了哪些 Memory。Release 1 不引入新 Agent 框架，也不扩大 MVP Tool 权限。

## 标准映射

- `pm-ai-agent-book/book2`：采用 Prompt、Context、Retrieval、Memory 的责任、边界、异常与验收结构。
- `bojieli/ai-agent-book`：采用可复现实验思想，将 Prompt 版本、Context 预算、证据来源和 Memory 门禁变成可检查数据。

## 冻结契约

- Prompt：`id + semver + sha256`；运行时读取版本化文件，Snapshot 保存实际 Hash。
- Context：固定类型、固定顺序、唯一 Section；预算计量所有模型可见字符串字段，未知类型和超预算默认拒绝，不静默裁剪。
- Knowledge：必须标记为 `untrusted_data`，每个 Item 保留 `source_uri + content_hash`，不得执行资料中的指令。
- Memory：读取按重要度、置信度、更新时间排序；自动写入绑定 Task、Trace、Extractor Version，并标记为 `untrusted_data`；写入必须通过稳定性、未来价值、置信度、敏感信息、重复和存储层冲突门禁。
- Worker：校验 Task 与 Context 一致、预算有效、Section 唯一、Knowledge 信任级别和 Item Hash。

## 运行闭环

```text
Versioned Prompt + Task + Memory Hits + Knowledge Hits
                         ↓
              Decision Context Snapshot
                         ↓
               Sandboxed Python Worker
                         ↓
             Rust ToolExecutor + Evaluation
                         ↓
              Gated Experience Candidate
```

## 验收

1. 合法 Decision Context 通过 JSON Contract；未知版本、非法预算或重复 Section 失败关闭。
2. 真实 Golden Path 输出 Prompt 版本、Context 预算、Knowledge 引用和 Memory 写入结果。
3. PRD 包含可追踪的 `source_uri#item_id`，但不把 Knowledge 当作指令。
4. 重复运行不重复导入 Knowledge，不重复保存相同 Memory；后一 Task 能召回前一 Task 的 Experience。
5. `./scripts/check.sh` 覆盖 Rust、Python、Contract、Migration 与真实 Seatbelt 跨进程测试。

## 非范围

向量数据库、云端知识库、自动解决 Memory 冲突、动态 Prompt 自修改、Multi-Agent。
