# AI Employee macOS Client

SwiftPM + SwiftUI 客户端。它负责桌面交互、写入审批和运行证据展示；推理、权限、Tool 执行与持久化仍由 Rust/Python Runtime 负责。Task 使用 canonical ID，事件按 cursor 续读，取消必须由 Runtime 确认并持久化。

从仓库根目录运行 `./script/build_and_run.sh --verify`。脚本会先构建 Rust Runtime 和 Swift Client，再生成 `dist/AIEmployee.app`。Bundle 内含 Rust Runtime、Python Worker 和 Alex Golden Path 所需 Package；用户数据库和产物保存在 `~/Library/Application Support/AIEmployee/`，不写入只读 Bundle。
