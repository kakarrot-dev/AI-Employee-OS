import SwiftUI

struct SettingsView: View {
    @AppStorage("themeMode") private var themeModeRaw = ThemeMode.system.rawValue

    var body: some View {
        TabView {
            Form {
                Picker("外观", selection: $themeModeRaw) {
                    ForEach(ThemeMode.allCases) { mode in
                        Text(mode.title).tag(mode.rawValue)
                    }
                }
                Text("所有模式都使用 Claude Cream 语义 Token。")
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
