import Foundation

enum AppDestination: String, CaseIterable, Identifiable {
    case office
    case contacts
    case work
    case capabilities

    var id: String { rawValue }

    var title: String {
        switch self {
        case .office: "办公室"
        case .contacts: "通讯录"
        case .work: "工作"
        case .capabilities: "能力库"
        }
    }

    var systemImage: String {
        switch self {
        case .office: "building.2"
        case .contacts: "person.2"
        case .work: "bubble.left.and.bubble.right"
        case .capabilities: "square.grid.2x2"
        }
    }
}
