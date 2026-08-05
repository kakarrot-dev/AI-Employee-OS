import SwiftUI

struct SettingsView: View {
    @State private var selection: SettingsSection = .general
    @State private var deepSeekKey = ""
    @State private var error: String?
    @State private var hasLegacyKey = false
    @AppStorage("deepseekKeyConfigured") private var saved = false
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationSplitView {
            SettingsSidebarView(selection: $selection)
                .navigationSplitViewColumnWidth(min: 220, ideal: 232, max: 240)
        } detail: {
            ScrollView {
                settingsPage
                    .frame(maxWidth: 620, alignment: .topLeading)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 28)
            }
            .background(palette.canvas)
        }
        .tint(palette.primary)
        .navigationTitle("设置")
        .onAppear {
            saved = KeychainService.exists()
            hasLegacyKey = KeychainService.legacyItemExists()
        }
    }

    @ViewBuilder
    private var settingsPage: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(selection.title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
            Divider().overlay(palette.hairlineSoft)

            switch selection {
            case .general:
                settingsGroup("应用") {
                    LabeledContent("语言", value: "简体中文")
                    LabeledContent("启动窗口", value: "恢复上次位置")
                }
            case .model:
                modelSettings
            case .runtime:
                settingsGroup("本地运行时") {
                    LabeledContent("执行边界", value: "Rust Runtime")
                    LabeledContent("Agent Worker", value: "Python")
                    LabeledContent("连接方式", value: "本机进程")
                }
            case .permissions:
                settingsGroup("权限与审批") {
                    LabeledContent("Tool 调用", value: "全部经过 Runtime")
                    LabeledContent("文件写入", value: "一次性审批")
                    LabeledContent("未知权限", value: "默认拒绝")
                    Text("客户端不会直接执行 Tool，也不会绕过审批和审计。")
                        .font(.caption).foregroundStyle(palette.muted)
                }
            case .appearance:
                settingsGroup("外观") {
                    Picker("主题", selection: $appearanceRaw) {
                        ForEach(AppAppearance.allCases) { appearance in
                            Text(appearance.title).tag(appearance.rawValue)
                        }
                    }
                    .pickerStyle(.segmented)
                    LabeledContent("配色", value: "Claude Cream")
                    Text("默认跟随系统，也可以为当前应用固定浅色或深色。")
                        .font(.caption).foregroundStyle(palette.muted)
                }
            case .about:
                settingsGroup("AI Employee OS") {
                    LabeledContent("运行方式", value: "Local-first")
                    LabeledContent("客户端", value: "SwiftUI for macOS")
                    Text("接收任务、规划、调用工具、产出 PRD、保存经验。")
                        .foregroundStyle(palette.body)
                }
            }
        }
    }

    private var modelSettings: some View {
        settingsGroup("DeepSeek") {
            SecureField("API Key", text: $deepSeekKey)
                .textFieldStyle(.roundedBorder)
            HStack {
                Button(saved ? "替换 API Key" : "保存 API Key") {
                    do { try KeychainService.save(deepSeekKey); deepSeekKey = ""; saved = true; error = nil }
                    catch { self.error = error.localizedDescription }
                }
                .buttonStyle(.borderedProminent)
                .disabled(deepSeekKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if saved { Button("删除", role: .destructive) { KeychainService.delete(); saved = false } }
            }
            Label(saved ? "已安全保存在 macOS Keychain" : "尚未配置，Alex 无法调用真实模型", systemImage: saved ? "checkmark.circle.fill" : "key")
                .font(.caption)
                .foregroundStyle(saved ? palette.success : palette.muted)
            if !saved, hasLegacyKey {
                Text("检测到旧开发签名保存的 Key。macOS 不允许新签名静默读取，请重新保存一次；旧项不会被自动读取或删除。")
                    .font(.caption)
                    .foregroundStyle(palette.warning)
            }
            if let error { Text(error).font(.caption).foregroundStyle(palette.error) }
        }
    }

    private func settingsGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.headline).foregroundStyle(palette.ink)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

enum SettingsSection: String, CaseIterable, Identifiable {
    case general, model, runtime, permissions, appearance, about

    var id: String { rawValue }
    var title: String {
        switch self {
        case .general: "通用"
        case .model: "模型"
        case .runtime: "Runtime 与连接"
        case .permissions: "权限与审批"
        case .appearance: "外观"
        case .about: "关于"
        }
    }
    var systemImage: String {
        switch self {
        case .general: "slider.horizontal.3"
        case .model: "brain.head.profile"
        case .runtime: "point.3.connected.trianglepath.dotted"
        case .permissions: "lock.shield"
        case .appearance: "circle.lefthalf.filled"
        case .about: "info.circle"
        }
    }
}
