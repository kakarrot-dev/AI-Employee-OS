import SwiftUI

struct SettingsView: View {
    @State private var selection: SettingsSection = .general
    @State private var compactShowsDetail = false
    @AppStorage(ModelConfiguration.providerKey) private var providerRaw = ""
    @AppStorage(ModelConfiguration.modelKey) private var modelName = ""
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        AdaptiveBrowser(profile: .settings, compactShowsDetail: $compactShowsDetail) {
            SettingsSidebarView(selection: adaptiveSelection)
        } detail: { showsBack in
            settingsDetail(showsBack: showsBack)
        }
        .tint(palette.primary)
        .moduleNavigationTitle(.settings)
        .onAppear { normalizeModelSelection() }
    }

    private var adaptiveSelection: Binding<SettingsSection> {
        Binding(
            get: { selection },
            set: { next in
                selection = next
                compactShowsDetail = true
            }
        )
    }

    private func settingsDetail(showsBack: Bool) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if showsBack {
                    Button {
                        compactShowsDetail = false
                    } label: {
                        Label("返回设置", systemImage: "chevron.left")
                    }
                    .buttonStyle(CreamSecondaryButtonStyle())
                    .help("返回设置列表")
                }
                settingsPage
            }
            .frame(maxWidth: 620, alignment: .topLeading)
            .padding(.horizontal, showsBack ? 16 : 32)
            .padding(.vertical, showsBack ? 20 : 28)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(palette.canvas)
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
                    Text("服务商")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .frame(width: 96, alignment: .leading)
                    Picker("服务商", selection: $providerRaw) {
                        ForEach(configuredProviders, id: \.self) { provider in
                            Text(provider == "poe" ? "Poe" : provider.capitalized).tag(provider)
                        }
                    }
                    .labelsHidden()
                    .onChange(of: providerRaw) { _, _ in
                        normalizeModelSelection()
                    }
                }
                .frame(minHeight: 46)

                SettingsRowDivider()

                HStack(spacing: 18) {
                    Text("模型")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .frame(width: 96, alignment: .leading)
                    Picker("模型", selection: $modelName) {
                        ForEach(configuredModels, id: \.self) { model in
                            Text(model).tag(model)
                        }
                    }
                    .labelsHidden()
                }
                .frame(minHeight: 46)

            }

            Label(
                ModelConfiguration.models.isEmpty ? "未找到可用的本机模型配置" : "已找到 \(ModelConfiguration.models.count) 个本机模型配置",
                systemImage: ModelConfiguration.models.isEmpty ? "exclamationmark.triangle" : "checkmark.circle.fill"
            )
            .font(.caption)
            .foregroundStyle(ModelConfiguration.models.isEmpty ? palette.warning : palette.success)
            SettingsFootnote(text: "模型凭证由本机配置提供，客户端不会显示或保存。")
        }
    }

    private var runtimeSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                SettingsInfoRow(label: "执行位置", value: "本机")
                SettingsRowDivider()
                SettingsInfoRow(label: "安全边界", value: "受控执行环境")
                SettingsRowDivider()
                SettingsInfoRow(label: "推理方式", value: "独立进程")
            }
            SettingsFootnote(text: "工具操作由本机运行环境校验权限、审批与审计后执行。")
        }
    }

    private var permissionsSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsCard {
                SettingsInfoRow(label: "工具使用", value: "由运行环境统一执行")
                SettingsRowDivider()
                SettingsInfoRow(label: "文件写入", value: "每次确认")
                SettingsRowDivider()
                SettingsInfoRow(label: "未知权限", value: "拒绝执行")
            }
            SettingsFootnote(text: "客户端不会直接执行工具，也不会绕过审批与审计。")
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
                SettingsInfoRow(label: "运行方式", value: "本地优先")
                SettingsRowDivider()
                SettingsInfoRow(label: "平台", value: "macOS")
            }
            SettingsFootnote(text: "在同一个本地工作台管理员工对话、协作任务、技能与交付。")
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }

    private var configuredProviders: [String] { Array(Set(ModelConfiguration.models.map(\.provider))).sorted() }
    private var configuredModels: [String] { ModelConfiguration.models.filter { $0.provider == providerRaw }.map(\.model) }

    private func normalizeModelSelection() {
        guard let first = ModelConfiguration.models.first else { providerRaw = ""; modelName = ""; return }
        if !configuredProviders.contains(providerRaw) { providerRaw = first.provider }
        if !configuredModels.contains(modelName) { modelName = configuredModels.first ?? first.model }
    }
}

enum SettingsSection: String, CaseIterable, Identifiable {
    case general, model, runtime, permissions, appearance, about

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general: "通用"
        case .model: "模型"
        case .runtime: "运行环境"
        case .permissions: "权限与审批"
        case .appearance: "外观"
        case .about: "关于"
        }
    }

    var detail: String {
        switch self {
        case .general: "窗口与语言偏好"
        case .model: "选择当前使用的模型"
        case .runtime: "本机执行与连接方式"
        case .permissions: "工具权限与确认规则"
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
