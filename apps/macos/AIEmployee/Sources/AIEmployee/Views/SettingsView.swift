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
        .moduleNavigationTitle(.settings)
        .onAppear {
            saved = KeychainService.exists()
            hasLegacyKey = KeychainService.legacyItemExists()
        }
    }

    @ViewBuilder
    private var settingsPage: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsPageHeader(title: selection.title, detail: selection.detail)

            switch selection {
            case .general:
                generalSettings
            case .model:
                modelSettings
            case .runtime:
                runtimeSettings
            case .permissions:
                permissionsSettings
            case .appearance:
                appearanceSettings
            case .about:
                aboutSettings
            }
        }
    }

    private var generalSettings: some View {
        SettingsCard {
            SettingsInfoRow(label: "语言", value: "简体中文")
            SettingsRowDivider()
            SettingsInfoRow(label: "启动窗口", value: "恢复上次位置")
        }
    }

    private var modelSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                HStack(spacing: 18) {
                    Text("API Key")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .frame(width: 96, alignment: .leading)
                    SecureField("输入 DeepSeek API Key", text: $deepSeekKey)
                        .textFieldStyle(.plain)
                        .foregroundStyle(palette.body)
                }
                .frame(minHeight: 46)

                SettingsRowDivider()

                HStack(spacing: 10) {
                    Spacer(minLength: 0)
                    if saved {
                        Button("删除", role: .destructive) {
                            KeychainService.delete()
                            saved = false
                        }
                        .buttonStyle(CreamSecondaryButtonStyle())
                    }
                    Button(saved ? "替换 API Key" : "保存 API Key") {
                        do {
                            try KeychainService.save(deepSeekKey)
                            deepSeekKey = ""
                            saved = true
                            error = nil
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(deepSeekKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .frame(minHeight: 52)
            }

            Label(
                saved ? "已安全保存在 macOS Keychain" : "尚未配置，Alex 无法调用真实模型",
                systemImage: saved ? "checkmark.circle.fill" : "key"
            )
            .font(.caption)
            .foregroundStyle(saved ? palette.success : palette.muted)

            if !saved, hasLegacyKey {
                SettingsFootnote(
                    text: "检测到旧开发签名保存的 Key。macOS 不允许新签名静默读取，请重新保存一次；旧项不会被自动读取或删除。",
                    tone: .warning
                )
            }
            if let error {
                SettingsFootnote(text: error, tone: .error)
            }
        }
    }

    private var runtimeSettings: some View {
        SettingsCard {
            SettingsInfoRow(label: "执行边界", value: "Rust Runtime")
            SettingsRowDivider()
            SettingsInfoRow(label: "Agent Worker", value: "Python")
            SettingsRowDivider()
            SettingsInfoRow(label: "连接方式", value: "本机进程")
        }
    }

    private var permissionsSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                SettingsInfoRow(label: "Tool 调用", value: "全部经过 Runtime")
                SettingsRowDivider()
                SettingsInfoRow(label: "文件写入", value: "一次性审批")
                SettingsRowDivider()
                SettingsInfoRow(label: "未知权限", value: "默认拒绝")
            }
            SettingsFootnote(text: "客户端不会直接执行 Tool，也不会绕过审批和审计。")
        }
    }

    private var appearanceSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                HStack(spacing: 18) {
                    Text("主题")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .frame(width: 96, alignment: .leading)
                    CreamSegmentedControl(
                        options: AppAppearance.allCases,
                        selection: Binding(
                            get: { AppAppearance(rawValue: appearanceRaw) ?? .system },
                            set: { appearanceRaw = $0.rawValue }
                        ),
                        title: { $0.title }
                    )
                }
                .frame(minHeight: 46)

                SettingsRowDivider()
                SettingsInfoRow(label: "配色", value: "Claude Cream")
            }
            SettingsFootnote(text: "默认跟随系统，也可以为当前应用固定浅色或深色。")
        }
    }

    private var aboutSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                SettingsInfoRow(label: "运行方式", value: "Local-first")
                SettingsRowDivider()
                SettingsInfoRow(label: "客户端", value: "SwiftUI for macOS")
            }
            SettingsFootnote(text: "接收任务、规划、调用工具、产出 PRD、保存经验。")
        }
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

    var detail: String {
        switch self {
        case .general: "窗口与语言偏好"
        case .model: "DeepSeek Key 与调用配置"
        case .runtime: "本机执行边界说明"
        case .permissions: "Tool 与审批策略"
        case .appearance: "主题与配色"
        case .about: "产品与运行方式"
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
