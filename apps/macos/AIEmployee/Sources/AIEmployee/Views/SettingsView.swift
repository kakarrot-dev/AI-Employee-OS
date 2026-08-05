import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            Form {
                LabeledContent("外观", value: "Claude Cream 浅色")
                Text("当前版本只实现并验收浅色模式。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .formStyle(.grouped)
            .tabItem { Label("通用", systemImage: "gearshape") }

            Form {
                LabeledContent("任务与产物", value: "Application Support/AIEmployee")
                LabeledContent("Secret", value: "不写入 SQLite、日志或产物")
                LabeledContent("执行边界", value: "Rust Runtime")
                Text("客户端不会直接读取 SQLite，也不会绕过 Runtime 执行工具。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .formStyle(.grouped)
            .tabItem { Label("隐私", systemImage: "lock.shield") }
        }
        .frame(width: 520, height: 300)
        .scenePadding()
    }
}
