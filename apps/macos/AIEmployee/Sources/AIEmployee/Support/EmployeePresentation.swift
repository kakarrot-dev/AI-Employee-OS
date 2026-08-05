import Foundation

enum EmployeePresence: String {
    case available
    case working
    case attention
    case failed
    case disabled

    var title: String {
        switch self {
        case .available: "空闲"
        case .working: "工作中"
        case .attention: "等待处理"
        case .failed: "需要关注"
        case .disabled: "已停用"
        }
    }

    var systemImage: String {
        switch self {
        case .available: "checkmark.circle.fill"
        case .working: "circle.dotted"
        case .attention: "exclamationmark.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        case .disabled: "pause.circle.fill"
        }
    }

    static func resolve(activeRun: TaskRun?, latestRun: TaskRun?) -> Self {
        guard let activeRun else {
            return latestRun?.status == .failed ? .failed : .available
        }
        if activeRun.actions.contains(where: { $0.status == "blocked" || $0.status == "result_unknown" }) {
            return .attention
        }
        return .working
    }
}
