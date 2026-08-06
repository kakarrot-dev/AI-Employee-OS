# 办公室页接真数据

## 目标

把办公室页的当前工作、脉冲和用量概览接到 SQLite 真数据；移除团队状态与最近交付展示；页面进入及数据更新时提供尊重“减少动态效果”的轻量动效；成本按 DeepSeek V4 Flash 官方人民币价格保守估算。

## 步骤

- [x] Runtime：`usage-summary` 聚合 `model_calls`（近 7 自然日 + 固定单价成本），注册 CLI / usage，补空库与有数据单测
- [x] 客户端：`RuntimeService.loadUsageSummary` + 解码模型；TaskStore/办公室与 history 同生命周期加载；`OfficeSnapshot.live` 接 usage、修正交付过滤与员工名映射
- [x] 办公室 UI：只展示当前工作与用量；移除团队状态和最近交付；工作行可进入对应工作区
- [x] 动效：页面切换或数据更新时，卡片数字从 0 计数到目标值，折线从左到右绘制；尊重系统“减少动态效果”
- [x] 回归门禁：`check_office_motion.py` 要求显式计数插值、数据更新重播、折线绘制遮罩和 Reduce Motion 边界同时存在
- [x] 成本：`deepseek-v4-flash` 按官方 ¥1/M 输入缓存未命中、¥2/M 输出估算；契约显式返回 CNY、模型、计价口径和官方来源
- [x] 验证：`cargo test`（usage-summary）、Swift ClientModelChecks（live 交付与用量）、能跑则跑相关检查

## Review

- Runtime 新增 `usage-summary`：按本地自然日聚合近 7 日 `model_calls(status=succeeded)`，缺日补 0，今天 label「今天」，成本按 DeepSeek V4 Flash 输入缓存未命中 ¥1/MTok、输出 ¥2/MTok
- 客户端 `TaskStore.restoreHistory` 同生命周期加载用量；失败或 `model_calls==0` → `usage=nil`（空占位）
- `OfficeSnapshot.live`：交付认 `verifiedArtifactPath ?? artifactPath` 或 `deliverableTitle`；员工名按 `agentID` 映射
- `OfficeWorkspaceView`：当前工作展示 pending / running / blocked / result_unknown / failed，并复用现有工作区跳转；不展示团队状态和最近交付
- 动效由显式 `dataAnimationProgress` 驱动：数字使用 `Animatable` 插值，折线裁剪绘图区从左到右展开；每次页面进入或数据变化播放 0.9 秒，不循环、不弹跳
- 开启系统“减少动态效果”时进度直接设为 1，不播放计数、描线或位移动画
- 当前 `model_calls` 没有缓存命中 Token 拆分，因此输入统一按缓存未命中价估算，避免虚报缓存优惠
- 验证：`cargo test usage_summary` 2 passed；ClientModelChecks passed；本地 `usage-summary` CLI 对 `storage/database/runtime.db` 返回 7 点（当前库近 7 日 calls=0）
- `./scripts/check.sh` 通过：Rust 59 tests、Python 38 tests、契约/Keychain/Runtime/客户端模型检查均通过
- `./script/build_and_run.sh` 通过；真实 App 办公室仅显示当前工作与用量，本机数据为 2.7K Token、成本 `<¥0.01`，团队状态和最近交付已完全移除
- 遗留：工作路径仍不写 `model_calls`；聊天后需等下次 history 恢复才刷新用量
