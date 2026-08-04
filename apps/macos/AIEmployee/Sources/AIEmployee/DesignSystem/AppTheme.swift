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

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
    }

    enum Motion {
        static let fast = 0.12
        static let standard = 0.22
        static let emphasized = 0.35
    }

    enum Elevation {
        static let composerRadius: CGFloat = 10
        static let composerY: CGFloat = 3
        static let composerOpacity = 0.08
    }

    static func palette(for scheme: ColorScheme) -> Palette {
        if scheme == .dark {
            return Palette(
                primary: Color(hex: 0xE6BF7A), primaryActive: Color(hex: 0xF0CF92), onPrimary: Color(hex: 0x2A1E1B),
                ink: Color(hex: 0xE9E6DC), body: Color(hex: 0xDDD9CD), muted: Color(hex: 0xBBB6A8), mutedSoft: Color(hex: 0x8C887E),
                hairline: Color(hex: 0x3D3D3A), hairlineSoft: Color(hex: 0x343533), canvas: Color(hex: 0x2D2E2D),
                surfaceSoft: Color(hex: 0x2A2B2A), surfaceCard: Color(hex: 0x303030), accentTeal: Color(hex: 0x75B5BC),
                success: Color(hex: 0x9AB889), warning: Color(hex: 0xE6BF7A), error: Color(hex: 0xEA928A)
            )
        }
        return Palette(
            primary: Color(hex: 0xB7791F), primaryActive: Color(hex: 0x9F6819), onPrimary: Color(hex: 0xFFF8F3),
            ink: Color(hex: 0x29271D), body: Color(hex: 0x403D36), muted: Color(hex: 0x6D675B), mutedSoft: Color(hex: 0x8D8575),
            hairline: Color(hex: 0xD8D2C3), hairlineSoft: Color(hex: 0xE5E0D4), canvas: Color(hex: 0xF5F3E9),
            surfaceSoft: Color(hex: 0xF8F7F2), surfaceCard: Color(hex: 0xFFFFFF), accentTeal: Color(hex: 0x2C6F75),
            success: Color(hex: 0x4B6F3D), warning: Color(hex: 0x8A5E16), error: Color(hex: 0x7C1B13)
        )
    }
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
