import Foundation

extension TaskRunStatus {
    var title: String {
        switch self {
        case .pending: "等待执行"
        case .running: "正在处理"
        case .succeeded: "已完成"
        case .failed: "未能完成"
        case .cancelled: "已取消"
        }
    }

    var systemImage: String {
        switch self {
        case .pending: "clock"
        case .running: "progress.indicator"
        case .succeeded: "checkmark.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        case .cancelled: "xmark.circle"
        }
    }
}

enum TaskPresentation {
    static func threadStatus(_ status: String) -> String {
        switch status {
        case "drafting": "草拟中"
        case "awaiting_input": "等待补充"
        case "awaiting_confirmation": "等待确认"
        case "pending": "等待开始"
        case "running": "执行中"
        case "waiting_dependency": "等待依赖"
        case "waiting_approval": "等待审批"
        case "approved": "已允许"
        case "rejected": "已拒绝"
        case "accepted": "已交接"
        case "verified": "已验证"
        case "started": "已开始"
        case "succeeded": "已完成"
        case "failed": "未能完成"
        case "cancelled": "已取消"
        default: "状态待确认"
        }
    }

    static func threadStatusSystemImage(_ status: String) -> String {
        switch status {
        case "succeeded", "verified", "approved", "accepted": "checkmark.circle.fill"
        case "failed", "rejected", "cancelled": "xmark.circle.fill"
        case "running", "started": "play.circle.fill"
        default: "clock.fill"
        }
    }

    static func runPhase(_ phase: String, waitingReason: String?) -> String {
        switch phase {
        case "preflight": "正在检查运行条件"
        case "context_build": "正在准备上下文"
        case "model_decision": "正在决定下一步"
        case "waiting_user": waitingReason == nil ? "等待补充信息" : "等待补充信息 · \(waitingReason!)"
        case "waiting_approval": "等待授权"
        case "tool_execution": "正在调用工具"
        case "observe": "正在核对工具结果"
        case "validate_output": "正在验证输出"
        case "evaluate": "正在评估交付质量"
        case "terminal": "运行已收敛"
        default: "正在处理"
        }
    }

    static func actionTitle(_ stepID: String) -> String {
        switch stepID {
        case "analyze": "分析需求与证据"
        case "write": "生成 PRD 文档"
        case "inspect-context": "检查会话与工作上下文"
        case "design-structure": "设计工作库信息结构"
        case "write-document": "生成工作库说明文档"
        case "implement-ui": "实现进度与交付物展示"
        case "write-approved-file": "写入工作库设计说明"
        case "verify-output": "验证界面与输出结果"
        case "search_web": "搜索公开网页"
        default: stepID.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func actionStatus(_ status: String) -> String {
        switch status {
        case "pending": "等待中"
        case "running": "执行中"
        case "succeeded": "已完成"
        case "failed": "未能完成"
        case "blocked": "等待授权"
        case "result_unknown": "结果待核验"
        case "cancelled": "已取消"
        default: "状态待确认"
        }
    }

    static func eventTitle(_ type: String) -> String {
        switch type {
        case "task_created": "任务已创建"
        case "task_started": "员工开始处理"
        case "evaluation_passed": "交付质量检查通过"
        case "evaluation_blocked": "交付质量检查未通过"
        case "task_succeeded": "任务已完成"
        case "task_failed": "任务未能完成"
        case "task_cancelled": "任务已取消"
        default: "工作状态已更新"
        }
    }

    static func date(_ value: String) -> String {
        guard let date = parsedDate(value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    static func time(_ value: String) -> String {
        guard let date = parsedDate(value) else { return value }
        return date.formatted(date: .omitted, time: .shortened)
    }

    static func isChronologicallyBefore(_ lhs: String, _ rhs: String) -> Bool {
        guard let lhsDate = parsedDate(lhs), let rhsDate = parsedDate(rhs) else {
            return lhs < rhs
        }
        return lhsDate < rhsDate
    }

    static func elapsed(_ startedAt: String, at date: Date = .now) -> String {
        guard let start = parsedDate(startedAt) else { return "" }
        let seconds = max(0, Int(date.timeIntervalSince(start)))
        if seconds < 60 { return "\(seconds) 秒" }
        return "\(seconds / 60) 分 \(seconds % 60) 秒"
    }

    private static func parsedDate(_ value: String) -> Date? {
        let fractionalISO8601 = ISO8601DateFormatter()
        fractionalISO8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalISO8601.date(from: value) { return date }

        let standardISO8601 = ISO8601DateFormatter()
        standardISO8601.formatOptions = [.withInternetDateTime]
        if let date = standardISO8601.date(from: value) { return date }

        guard let timestamp = Double(value) else { return nil }
        let seconds = timestamp > 10_000_000_000 ? timestamp / 1_000 : timestamp
        return Date(timeIntervalSince1970: seconds)
    }
}
