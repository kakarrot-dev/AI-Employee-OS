# 更新 AGENTS.md / CLAUDE.md / README.md

## 目标

三份文档与当前代码/架构对齐：说清已落地能力、进程边界、Package 模型与验证入口；不把临时缺口写成产品承诺，也不假装尚未接通的能力已可用。

## 计划

- [x] 重写 `AGENTS.md`：项目目标、架构边界、Package/能力门控、MVP 分层、验证与 Git（保留不变量）
- [x] 轻量更新 `CLAUDE.md`：启动阅读顺序 + `tasks/lessons.md` 指针
- [x] 重写 `README.md`：当前状态、架构图、仓库结构、跑通方式、事实源
- [x] 自检：三份文档无互相矛盾；不引入第二套状态规则

## Review

- AGENTS：目标改为对话 + Package + 意图路由；MVP 分「产品可见 / Runtime 已有 / 暂不包含」；明确 Skill 绑定 vs Tool 全局、`tasks_enabled` 语义、多员工边界
- CLAUDE：薄入口，启动三步 + lessons 指针，不复制硬规则
- README：去掉「只保留 Alex」；补工作库导航、`build_and_run.sh` / `--ui-demo`、`script/` 目录；与 AGENTS 表述一致
- 未在文档中展开 `app.worker` 实现缺口
