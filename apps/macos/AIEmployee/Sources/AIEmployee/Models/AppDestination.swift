import Foundation

enum AppDestination: String, CaseIterable, Identifiable {
    case office
    case contacts
    case work
    case archive
    case employeeChat
    case knowledge
    case skills
    case tools
    case settings

    var id: String { rawValue }

    static let allCases: [AppDestination] = [.office, .contacts, .work, .knowledge, .skills, .tools, .archive, .settings]

    var title: String {
        switch self {
        case .office: "办公室"
        case .contacts: "通讯录"
        case .work: "工作库"
        case .archive: "归档"
        case .employeeChat: "员工聊天"
        case .knowledge: "知识库"
        case .skills: "技能库"
        case .tools: "工具库"
        case .settings: "设置"
        }
    }

    var systemImage: String {
        switch self {
        case .office: "building.2"
        case .contacts: "person.2"
        case .work: "clock.arrow.circlepath"
        case .archive: "archivebox"
        case .employeeChat: "bubble.left.and.bubble.right"
        case .knowledge: "books.vertical"
        case .skills: "sparkles"
        case .tools: "wrench.and.screwdriver"
        case .settings: "gearshape"
        }
    }

    static let primary: [AppDestination] = [.office, .contacts, .work, .knowledge, .skills, .tools]
}
