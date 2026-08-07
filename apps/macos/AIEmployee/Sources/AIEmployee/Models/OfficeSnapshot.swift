import Foundation

struct OfficeSnapshot {
    struct UsagePoint: Identifiable {
        let id: String
        let label: String
        let inputTokens: Int
        let outputTokens: Int

        var totalTokens: Int { inputTokens + outputTokens }
    }

    struct UsageSummary {
        let inputTokens: Int
        let outputTokens: Int
        let estimatedCostCNY: Double
        let modelCalls: Int
        let points: [UsagePoint]
        let pricingModel: String?
        let pricingVersion: String?

        var totalTokens: Int { inputTokens + outputTokens }

        static var emptyPlaceholder: Self {
            let calendar = Calendar.current
            let today = Date()
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh_CN")
            formatter.dateFormat = "M/d"
            let points = (0..<7).reversed().map { offset -> UsagePoint in
                let day = calendar.date(byAdding: .day, value: -offset, to: today) ?? today
                return UsagePoint(
                    id: "empty-\(offset)",
                    label: offset == 0 ? "今天" : formatter.string(from: day),
                    inputTokens: 0,
                    outputTokens: 0
                )
            }
            return Self(inputTokens: 0, outputTokens: 0, estimatedCostCNY: 0, modelCalls: 0, points: points, pricingModel: nil, pricingVersion: nil)
        }
    }

    struct EmployeeItem: Identifiable {
        let id: String
        let name: String
        let role: String
        let status: String
    }

    struct WorkItem: Identifiable {
        enum State {
            case pending, running, blocked, resultUnknown, failed
        }

        let id: String
        let employeeName: String
        let goal: String
        let state: State
        let detail: String
        let progress: Double?
        let createdAt: String
    }

    struct DeliveryItem: Identifiable {
        let id: String
        let title: String
        let employeeName: String
        let artifactName: String
        let createdAt: String
    }

    let employees: [EmployeeItem]
    let currentWork: [WorkItem]
    let deliveries: [DeliveryItem]
    let isLoading: Bool
    let runtimeMessage: String?
    let isDemo: Bool
    let usage: UsageSummary?

    static func live(
        employees: [Employee],
        runs: [TaskRun],
        isLoading: Bool,
        runtimeMessage: String?,
        usage: UsageSummary? = nil
    ) -> Self {
        let nameByID = Dictionary(uniqueKeysWithValues: employees.map { ($0.id, $0.name) })
        let fallbackName = "AI 员工"
        let active = runs.compactMap { run -> WorkItem? in
            let unknown = run.actions.contains { $0.status == "result_unknown" }
            let blocked = run.actions.contains { $0.status == "blocked" }
            let state: WorkItem.State
            if unknown { state = .resultUnknown }
            else if blocked { state = .blocked }
            else if run.status == .failed { state = .failed }
            else if run.status == .running { state = .running }
            else if run.status == .pending { state = .pending }
            else { return nil }

            let completed = run.actions.filter { $0.status == "succeeded" }.count
            let progress = run.actions.isEmpty ? nil : Double(completed) / Double(run.actions.count)
            return WorkItem(
                id: run.id,
                employeeName: nameByID[run.agentID] ?? fallbackName,
                goal: run.input,
                state: state,
                detail: workDetail(for: state, run: run),
                progress: progress,
                createdAt: run.createdAt
            )
        }
        let employeeItems = employees.filter { $0.status == "active" }.map {
            EmployeeItem(id: $0.id, name: $0.name, role: $0.role, status: "可工作")
        }
        let deliveries = Array(runs.compactMap { run -> DeliveryItem? in
            guard run.status == .succeeded else { return nil }
            let path = run.verifiedArtifactPath ?? run.artifactPath
            guard path != nil || run.deliverableTitle != nil else { return nil }
            return DeliveryItem(
                id: run.id,
                title: run.deliverableTitle ?? run.input,
                employeeName: nameByID[run.agentID] ?? fallbackName,
                artifactName: path.map { URL(fileURLWithPath: $0).lastPathComponent } ?? (run.deliverableTitle ?? "交付物"),
                createdAt: run.createdAt
            )
        }.prefix(3))
        return Self(
            employees: employeeItems,
            currentWork: active,
            deliveries: deliveries,
            isLoading: isLoading,
            runtimeMessage: runtimeMessage,
            isDemo: false,
            usage: usage
        )
    }

    private static func workDetail(for state: WorkItem.State, run: TaskRun) -> String {
        switch state {
        case .pending: "任务已创建，正在等待 Runtime 接手"
        case .running: run.actions.last.map { "正在执行：\($0.outputAs)" } ?? "正在理解目标并制定执行计划"
        case .blocked: "有一项操作需要你确认后才能继续"
        case .resultUnknown: "外部操作结果未知，需要人工核验"
        case .failed: run.error ?? "执行失败，请打开工作查看原因"
        }
    }

}

struct UsageSummaryResponse: Codable, Sendable {
    struct Point: Codable, Sendable {
        let id: String
        let label: String
        let inputTokens: Int
        let outputTokens: Int

        enum CodingKeys: String, CodingKey {
            case id, label
            case inputTokens = "input_tokens"
            case outputTokens = "output_tokens"
        }
    }

    let schemaVersion: String
    let inputTokens: Int
    let outputTokens: Int
    let estimatedCostCNY: Double
    let modelCalls: Int
    let points: [Point]
    let pricingModel: String
    let pricingBasis: String
    let pricingVersion: String?
    let pricingSource: String?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case estimatedCostCNY = "estimated_cost_cny"
        case modelCalls = "model_calls"
        case points
        case pricingModel = "pricing_model"
        case pricingBasis = "pricing_basis"
        case pricingVersion = "pricing_version"
        case pricingSource = "pricing_source"
    }

    var officeSummary: OfficeSnapshot.UsageSummary? {
        guard modelCalls > 0 else { return nil }
        return OfficeSnapshot.UsageSummary(
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            estimatedCostCNY: estimatedCostCNY,
            modelCalls: modelCalls,
            points: points.map {
                OfficeSnapshot.UsagePoint(
                    id: $0.id,
                    label: $0.label,
                    inputTokens: $0.inputTokens,
                    outputTokens: $0.outputTokens
                )
            },
            pricingModel: pricingModel,
            pricingVersion: pricingVersion
        )
    }
}

enum OfficeDemoScene: String {
    case empty, ready, running, blocked, failed
    case resultUnknown = "result-unknown"
    case delivered
    case runtimeOffline = "runtime-offline"

    static var current: Self? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) else { return nil }
        let value = arguments[index + 1]
        if value == "office" { return .running }
        if value.hasPrefix("office:") {
            let scene = String(value.dropFirst("office:".count))
            // 兼容旧 demo 参数 office:approval
            if scene == "approval" { return .blocked }
            return Self(rawValue: scene)
        }
#endif
        return nil
    }

    var snapshot: OfficeSnapshot {
        let usagePoints = [
            OfficeSnapshot.UsagePoint(id: "0730", label: "7/30", inputTokens: 42_800, outputTokens: 12_400),
            OfficeSnapshot.UsagePoint(id: "0731", label: "7/31", inputTokens: 58_600, outputTokens: 18_900),
            OfficeSnapshot.UsagePoint(id: "0801", label: "8/1", inputTokens: 37_200, outputTokens: 11_800),
            OfficeSnapshot.UsagePoint(id: "0802", label: "8/2", inputTokens: 76_400, outputTokens: 24_600),
            OfficeSnapshot.UsagePoint(id: "0803", label: "8/3", inputTokens: 69_100, outputTokens: 21_300),
            OfficeSnapshot.UsagePoint(id: "0804", label: "8/4", inputTokens: 108_500, outputTokens: 34_200),
            OfficeSnapshot.UsagePoint(id: "0805", label: "今天", inputTokens: 86_700, outputTokens: 28_900)
        ]
        let usage = OfficeSnapshot.UsageSummary(
            inputTokens: usagePoints.reduce(0) { $0 + $1.inputTokens },
            outputTokens: usagePoints.reduce(0) { $0 + $1.outputTokens },
            estimatedCostCNY: 2.47,
            modelCalls: 47,
            points: usagePoints,
            pricingModel: "演示模型",
            pricingVersion: "demo"
        )
        let runtimeMessage = self == .runtimeOffline ? "Runtime 当前不可连接，用量数据可能不是最新状态" : nil
        return OfficeSnapshot(
            employees: [],
            currentWork: [],
            deliveries: [],
            isLoading: false,
            runtimeMessage: runtimeMessage,
            isDemo: true,
            usage: usage
        )
    }
}
