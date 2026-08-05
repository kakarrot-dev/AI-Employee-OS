import SwiftUI

struct SettingsView: View {
    @State private var deepSeekKey = ""
    @State private var error: String?
    @State private var hasLegacyKey = false
    @AppStorage("deepseekKeyConfigured") private var saved = false

    var body: some View {
        Form {
            Section("通用") {
                LabeledContent("外观", value: "Claude Cream 浅色")
                Text("当前版本只实现并验收浅色模式。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("模型") {
                SecureField("DeepSeek API Key", text: $deepSeekKey)
                HStack {
                    Button(saved ? "替换 API Key" : "保存 API Key") {
                        do { try KeychainService.save(deepSeekKey); deepSeekKey = ""; saved = true; error = nil }
                        catch { self.error = error.localizedDescription }
                    }
                    .disabled(deepSeekKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if saved { Button("删除", role: .destructive) { KeychainService.delete(); saved = false } }
                }
                Text(saved ? "已安全保存在 macOS Keychain" : "尚未配置，Alex 无法调用真实模型")
                    .font(.caption).foregroundStyle(saved ? .green : .secondary)
                if !saved, hasLegacyKey {
                    Text("检测到旧开发签名保存的 Key。由于 macOS 不允许新签名静默读取，请在这里重新保存一次；旧项不会被自动读取或删除。")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
            }

            Section("隐私与数据") {
                LabeledContent("任务与产物", value: "Application Support/AIEmployee")
                LabeledContent("Secret", value: "不写入 SQLite、日志或产物")
                LabeledContent("执行边界", value: "Rust Runtime")
                Text("客户端不会直接读取 SQLite，也不会绕过 Runtime 执行工具。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("设置")
        .frame(maxWidth: 760, maxHeight: .infinity, alignment: .top)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            saved = KeychainService.exists()
            hasLegacyKey = KeychainService.legacyItemExists()
        }
    }
}
