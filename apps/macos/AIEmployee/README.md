# AI Employee macOS Client

SwiftPM + SwiftUI 客户端。模型设置从项目根目录 `.env` 的 `AI_EMPLOYEE_MODELS` 读取并展示可选项，API Key 不在客户端展示或保存；Conversation、Message 与 ModelCall 由 Rust Runtime 持久化，模型调用由 Python Provider 完成。配置格式见 `.env.example`。

从仓库根目录运行 `./script/build_and_run.sh --verify`。脚本会先构建 Rust Runtime 和 Swift Client，再生成 `dist/AIEmployee.app`。Bundle 内含 Rust Runtime、Python Chat Worker、两名专职员工 Package、Skill 与 Tool Package；用户数据库保存在 `~/Library/Application Support/AIEmployee/`，不写入只读 Bundle。
