---
name: managed-research
description: 使用固定 GitHub REST 与用户授权 RSS/Atom 来源形成可审计 ResearchBundle；适用于开源项目和订阅源研究。
---

# 受管多源研究

## 适用边界

用于 GitHub 公开仓库发现和用户明确提供的 HTTPS RSS/Atom Feed。它不是通用网页浏览器，也不能替代需要登录、付费墙或私有仓库访问的研究。

## 输入契约

- GitHub 查询需说明主题、语言或技术边界；Feed 必须是用户授权的公网 HTTPS URL。
- 任务目标必须能由这两类来源支持；否则报告能力不匹配，不把有限来源包装成全面调研。

## 工作方法

1. 分别提交 GitHub 与 RSS ToolAction，参数只来自任务输入或 Runtime 可信上下文。
2. 保存每次 SourceAttempt 的状态、抓取时间、内容 Hash 和截断情况。
3. 对仓库描述、发布文章和作者观点分别定性；Star、更新时间等只作为信号，不直接证明质量。
4. 建立主张与来源条目索引，识别同名但内容不一致的来源。
5. 将成功与失败来源共同固化为 ResearchBundle，确保下游能复核覆盖范围。

## 输出契约

输出问题定义、查询、关键主张及来源索引、冲突、信息缺口和 ResearchBundle 的内容 Hash。无成功条目时不得生成肯定性研究结论。
