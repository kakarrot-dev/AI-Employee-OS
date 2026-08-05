import Foundation

enum AppDestination: String, CaseIterable, Identifiable {
    case office
    case contacts
    case work
    case capabilities
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .office: "办公室"
        case .contacts: "员工"
        case .work: "对话"
        case .capabilities: "能力"
        case .settings: "设置"
        }
    }

    var systemImage: String {
        switch self {
        case .office: "building.2"
        case .contacts: "person.2"
        case .work: "bubble.left.and.bubble.right"
        case .capabilities: "square.grid.2x2"
        case .settings: "gearshape"
        }
    }
}
