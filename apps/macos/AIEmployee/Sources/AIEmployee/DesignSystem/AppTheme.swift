import SwiftUI

enum AppTheme {
    struct Palette {
        let primary: Color
        let primaryActive: Color
        let onPrimary: Color
        let ink: Color
        let body: Color
        let muted: Color
        let mutedSoft: Color
        let hairline: Color
        let hairlineSoft: Color
        let canvas: Color
        let surfaceSoft: Color
        let surfaceCard: Color
        let accentTeal: Color
        let success: Color
        let warning: Color
        let error: Color
        let shadow: Color

        var textPrimary: Color { ink }
        var textSecondary: Color { body }
        var textTertiary: Color { muted }
        var selectionFill: Color { primary.opacity(AppTheme.Interaction.selectionFillOpacity) }
        var hoverFill: Color { surfaceCard.opacity(AppTheme.Interaction.hoverFillOpacity) }
        var focusStroke: Color { primary.opacity(AppTheme.Interaction.focusStrokeOpacity) }
        var dangerFill: Color { error.opacity(AppTheme.Interaction.dangerFillOpacity) }
    }

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    /// Shared macOS typography for dense navigation and long-form AI output.
    /// Values follow the refined scale selected by the component-library preview.
    enum Typography {
        static let pageTitleSize: CGFloat = 22
        static let sectionTitleSize: CGFloat = 16
        static let workspaceTitleSize: CGFloat = 14
        static let navigationSize: CGFloat = 13
        static let sidebarTitleSize: CGFloat = 13
        static let interfaceBodySize: CGFloat = 13
        static let readingBodySize: CGFloat = 14
        static let assistantBodySize: CGFloat = 14
        static let supportingSize: CGFloat = 12
        static let metadataSize: CGFloat = 11
        static let compactMetadataSize: CGFloat = 10
        static let codeSize: CGFloat = 12
        static let metricSize: CGFloat = 20

        static let readingLineSpacing: CGFloat = 5
        static let listLineSpacing: CGFloat = 4
        static let assistantLineSpacing: CGFloat = 4
        static let assistantListLineSpacing: CGFloat = 4
        static let assistantParagraphSpacing: CGFloat = 8
        static let codeLineSpacing: CGFloat = 4
        static let paragraphSpacing: CGFloat = 12
        static let listSpacing: CGFloat = 4
        static let blockSpacing: CGFloat = 12
        static let timelineSpacing: CGFloat = 20
        static let readingMeasure: CGFloat = 820

        static func navigation(weight: Font.Weight = .regular) -> Font {
            .system(size: navigationSize, weight: weight)
        }

        static var pageTitle: Font { .system(size: pageTitleSize, weight: .semibold) }
        static var sectionTitle: Font { .system(size: sectionTitleSize, weight: .semibold) }
        static var workspaceTitle: Font { .system(size: workspaceTitleSize, weight: .semibold) }

        static func sidebarTitle(weight: Font.Weight = .semibold) -> Font {
            .system(size: sidebarTitleSize, weight: weight)
        }

        static func interfaceBody(weight: Font.Weight = .regular) -> Font {
            .system(size: interfaceBodySize, weight: weight)
        }

        static func supporting(weight: Font.Weight = .regular) -> Font {
            .system(size: supportingSize, weight: weight)
        }

        static var messageBody: Font { .system(size: readingBodySize, weight: .regular) }
        static var messageAuthor: Font { .system(size: supportingSize, weight: .semibold) }
        static var composer: Font { .system(size: interfaceBodySize, weight: .regular) }
        static var metric: Font { .system(size: metricSize, weight: .semibold).monospacedDigit() }

        static func metadata(weight: Font.Weight = .regular) -> Font {
            .system(size: metadataSize, weight: weight)
        }

        static func compactMetadata(weight: Font.Weight = .regular) -> Font {
            .system(size: compactMetadataSize, weight: weight)
        }
    }

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16

        static let control = md
        static let selection: CGFloat = 9
        static let panel = lg
        static let modal = xl
        static let composer: CGFloat = 18
    }

    enum Control {
        static let compactHeight: CGFloat = 28
        static let buttonHeight: CGFloat = 32
        static let fieldHeight: CGFloat = 34
        static let hitTarget: CGFloat = 40
    }

    enum Interaction {
        static let selectionFillOpacity = 0.12
        static let hoverFillOpacity = 0.72
        static let focusStrokeOpacity = 0.32
        static let dangerFillOpacity = 0.10
        static let disabledOpacity = 0.52
        static let pressedScale: CGFloat = 0.98
    }

    enum Motion {
        static let pressFeedbackDuration = 0.12
        static let hoverRevealDuration = 0.12
        static let selectionMorphDuration = 0.18
        static let stateCrossfadeDuration = 0.18
        static let panelPresentationDuration = 0.22
        static let panelDismissalDuration = 0.16
        static let metricRevealDuration = 0.90
        static let activePulseDuration = 1.15

        static var pressFeedback: Animation { .easeOut(duration: pressFeedbackDuration) }
        static var hoverReveal: Animation { .easeOut(duration: hoverRevealDuration) }
        static var selectionMorph: Animation { .easeInOut(duration: selectionMorphDuration) }
        static var stateCrossfade: Animation { .easeOut(duration: stateCrossfadeDuration) }
        static var panelPresentation: Animation { .easeOut(duration: panelPresentationDuration) }
        static var panelDismissal: Animation { .easeIn(duration: panelDismissalDuration) }
        static var metricReveal: Animation { .easeOut(duration: metricRevealDuration) }
        static var activePulse: Animation {
            .easeInOut(duration: activePulseDuration).repeatForever(autoreverses: true)
        }
    }

    enum Elevation {
        static let composerRadius = Radius.composer
        static let composerY: CGFloat = 6
    }

    static func palette(for scheme: ColorScheme) -> Palette {
        if scheme == .dark {
            return Palette(
                primary: Color(hex: 0xE6BF7A), primaryActive: Color(hex: 0xF0CF92), onPrimary: Color(hex: 0x2A1E1B),
                ink: Color(hex: 0xE9E6DC), body: Color(hex: 0xDDD9CD), muted: Color(hex: 0xBBB6A8), mutedSoft: Color(hex: 0x9A958A),
                hairline: Color(hex: 0x3D3D3A), hairlineSoft: Color(hex: 0x343533), canvas: Color(hex: 0x2D2E2D),
                surfaceSoft: Color(hex: 0x2A2B2A), surfaceCard: Color(hex: 0x303030), accentTeal: Color(hex: 0x75B5BC),
                success: Color(hex: 0x9AB889), warning: Color(hex: 0xE6BF7A), error: Color(hex: 0xEA928A),
                shadow: Color.black.opacity(0.24)
            )
        }
        return Palette(
            primary: Color(hex: 0xB7791F), primaryActive: Color(hex: 0x9E6719), onPrimary: Color(hex: 0xFFF8F3),
            ink: Color(hex: 0x29271D), body: Color(hex: 0x403D36), muted: Color(hex: 0x6D675B), mutedSoft: Color(hex: 0x756F63),
            hairline: Color(hex: 0xD8D8D3), hairlineSoft: Color(hex: 0xE7E7E2), canvas: Color(hex: 0xF5F5F2),
            surfaceSoft: Color(hex: 0xEFEFEB), surfaceCard: Color(hex: 0xFCFCF9), accentTeal: Color(hex: 0x2C6F75),
            success: Color(hex: 0x4B6F3D), warning: Color(hex: 0x8A5E16), error: Color(hex: 0x7C1B13),
            shadow: Color(hex: 0x39372F).opacity(0.09)
        )
    }
}

enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "跟随系统"
        case .light: "浅色"
        case .dark: "深色"
        }
    }

    /// 解析为明确的 ColorScheme。跟随系统时读 OS 偏好，避免向 preferredColorScheme 传入 nil（SwiftUI 已知会半屏错色）。
    func resolvedColorScheme(system: ColorScheme) -> ColorScheme {
        switch self {
        case .system: system
        case .light: .light
        case .dark: .dark
        }
    }
}

enum SystemColorScheme {
    /// 读系统外观偏好，不受应用 preferredColorScheme 覆盖影响。
    static var current: ColorScheme {
        UserDefaults.standard.string(forKey: "AppleInterfaceStyle") == "Dark" ? .dark : .light
    }

    static let didChangeNotification = Notification.Name("AppleInterfaceThemeChangedNotification")
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
