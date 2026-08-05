# AI Employee macOS Client

SwiftPM + SwiftUI 客户端。当前只提供 Alex 的真实 DeepSeek 多轮对话；Conversation、Message 与 ModelCall 由 Rust Runtime 持久化，模型调用由 Python Provider 完成。Alex 当前不绑定 Skill 或 Tool。

从仓库根目录运行 `./script/build_and_run.sh --verify`。脚本会先构建 Rust Runtime 和 Swift Client，再生成 `dist/AIEmployee.app`。Bundle 内含 Rust Runtime、Python Chat Worker 和 Alex Agent Package；用户数据库保存在 `~/Library/Application Support/AIEmployee/`，不写入只读 Bundle。
