# AI Employee macOS Client

SwiftPM + SwiftUI 客户端。它负责桌面交互、写入审批和运行证据展示；推理、权限、Tool 执行与持久化仍由 Rust/Python Runtime 负责。

从仓库根目录运行 `./script/build_and_run.sh --verify`。脚本会先构建 Rust Runtime 和 Swift Client，再生成 `dist/AIEmployee.app`。
