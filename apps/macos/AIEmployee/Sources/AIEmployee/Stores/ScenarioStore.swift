import Foundation

@MainActor
final class ScenarioStore: ObservableObject {
    @Published private(set) var scenarios: [ScenarioSummary] = []
    @Published var selectedID: String?
    @Published var draft: ScenarioProposal?
    @Published var activeFlow: BusinessFlowProjection?
    @Published private(set) var flows: [BusinessFlowProjection] = []
    @Published private(set) var pendingRun: BusinessFlowRunState?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let runtime = RuntimeService.live()

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            scenarios = try await runtime.scenarioList()
            flows = try await runtime.businessFlowList()
            restorePendingRun()
            if selectedID == nil { selectedID = scenarios.first?.id }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func restorePendingRun() {
        guard let work = flows.flatMap(\.workOrders).first(where: {
            $0.status == "waiting_approval" || $0.status == "verification_required"
        }), let runID = work.runID else {
            pendingRun = nil
            return
        }
        pendingRun = BusinessFlowRunState(
            taskID: work.childTaskID,
            runID: runID,
            status: work.status,
            phase: work.runPhase ?? work.status,
            reason: nil,
            actionID: work.actionID
        )
    }

    func propose(objective: String, key: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            draft = try await runtime.scenarioPropose(objective, key).proposal
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func save(source: String) async -> Bool {
        guard var draft else { return false }
        if let finalization = draft.nodes.last(where: { $0.role == "finalization" }) {
            draft.coordinatorAgentID = finalization.suggestedAgentID
        }
        draft.edges = zip(draft.nodes, draft.nodes.dropFirst()).map {
            ScenarioEdge(predecessorNodeID: $0.nodeID, successorNodeID: $1.nodeID)
        }
        self.draft = draft
        isLoading = true
        defer { isLoading = false }
        do {
            let scenarioID = selectedID ?? "scenario_\(UUID().uuidString.lowercased().prefix(12))"
            _ = try await runtime.scenarioSave(scenarioID, source, draft)
            selectedID = scenarioID
            self.draft = nil
            await reload()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func startSelected() async {
        guard let selectedID else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let plan = try await runtime.businessFlowPlan(selectedID)
            let flowID = "flow_\(UUID().uuidString.lowercased().prefix(12))"
            activeFlow = try await runtime.businessFlowStart(flowID, selectedID, plan.planHash)
            await reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func continueFlow(_ flow: BusinessFlowProjection) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await runtime.businessFlowContinue(flow.id, KeychainService.load())
            activeFlow = response.flow
            pendingRun = response.run
            await reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resolvePendingRun(approve: Bool) async {
        guard let pendingRun else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await runtime.continueRun(pendingRun.runID, approve, KeychainService.load())
            self.pendingRun = nil
            await reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resolveUnknown(status: String) async {
        guard let actionID = pendingRun?.actionID else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await runtime.resolveUnknown(actionID, status)
            pendingRun = nil
            await reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancelFlow(_ flow: BusinessFlowProjection) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await runtime.cancel(flow.rootTaskID)
            pendingRun = nil
            await reload()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
