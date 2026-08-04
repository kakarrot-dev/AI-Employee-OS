import Foundation

enum AppDestination: String, CaseIterable, Identifiable {
    case company
    case alex
    case tasks
    case artifacts
    case knowledge

    var id: String { rawValue }

    var title: String {
        switch self {
        case .company: "公司"
        case .alex: "Alex"
        case .tasks: "任务"
        case .artifacts: "成果"
        case .knowledge: "知识"
        }
    }

    var systemImage: String {
        switch self {
        case .company: "building.2"
        case .alex: "person.crop.circle"
        case .tasks: "checklist"
        case .artifacts: "shippingbox"
        case .knowledge: "books.vertical"
        }
    }
}

enum ThemeMode: String, CaseIterable, Identifiable {
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
}
