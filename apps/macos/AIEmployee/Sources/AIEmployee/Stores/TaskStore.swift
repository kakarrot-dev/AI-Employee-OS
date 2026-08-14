import Foundation
import OSLog
import Combine

@MainActor
final class TaskStore: ObservableObject {
    private let service: RuntimeService
    private let logger = Logger(subsystem: "com.kakarrot.ai-employee-os", category: "Task")
    @Published var runs: [TaskRun] = []
    @Published var selection: String?
    @Published var draft = ""
    @Published var isCommandPalettePresented = false
    @Published private(set) var historyError: String?
    @Published private(set) var usage: OfficeSnapshot.UsageSummary?
    @Published private(set) var activeThread: TaskThreadProjection?
    @Published private(set) var taskThreads: [TaskThreadProjection] = []
    @Published private(set) var archivedTaskThreads: [TaskThreadProjection] = []
    @Published private(set) var proposalState: TaskProposalPresentationState = .idle

    @Published private(set) var isSubmitting = false
    @Published private var approvalRunsInFlight: Set<String> = []
    private var restoredTaskMonitors: [String: Task<Void, Never>] = [:]
    private var proposalGeneration: UInt = 0

    var activeProposal: TaskProposalResponse? {
        guard case .review(let proposal) = proposalState else { return nil }
        return proposal
    }

    var awaitingWorkConfirmation: Bool {
        if case .review = proposalState { return true }
        return false
    }

    @discardableResult
    private func beginProposalOperation(_ state: TaskProposalPresentationState) -> UInt {
        proposalGeneration &+= 1
        proposalState = state
        return proposalGeneration
    }

    private func invalidateProposalOperations() {
        proposalGeneration &+= 1
    }

    private func canApplyProposalOperation(_ generation: UInt, threadID: String) -> Bool {
        proposalGeneration == generation && activeThread?.id == threadID
    }

    init(service: RuntimeService, restoresOnInit: Bool = true) {
        self.service = service
        if let demo = WorkLibraryDemoData.current {
            runs = demo.runs
            selection = demo.runs.first?.id
            return
        }
        guard restoresOnInit else { return }
        Task {
            do { try await service.recover() }
            catch {
                historyError = error.localizedDescription
                logger.error("Could not reconcile interrupted Runtime actions")
            }
            await restoreHistory()
            await restoreThreads()
        }
    }

    func presentCommandPalette() {
        isCommandPalettePresented = true
    }

    func prepareInlineTask() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        requestRun()
    }

    func requestRun() {
        proposeWork()
    }

    func confirmAndRun() {
        guard !isSubmitting,
              let proposal = activeProposal,
              activeThread?.id == proposal.threadID else { return }
        let threadID = proposal.threadID
        isSubmitting = true
        let generation = beginProposalOperation(.generating)
        Task {
            defer { isSubmitting = false }
            do {
                let response = try await service.taskProposalConfirm(proposal.proposalID, proposal.proposalHash)
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                activeThread = response.thread
                proposalState = .initial(threadStatus: response.thread.status, proposal: nil)
                draft = ""
                await restoreHistory()
                await restoreThreads()
            } catch {
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                proposalState = .failure(code: RuntimeService.taskProposalErrorCode(from: error))
                historyError = error.localizedDescription
            }
        }
    }

    func proposeWork(preferredAgentID: String? = nil) {
        let objective = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !objective.isEmpty, !isSubmitting else { return }
        let selectedThreadID = activeThread?.id
        isSubmitting = true
        historyError = nil
        let generation = beginProposalOperation(.generating)
        Task {
            var proposalThreadID: String?
            defer { isSubmitting = false }
            do {
                let reusableThread = activeThread.flatMap { thread in
                    let canRetry = ["drafting", "awaiting_input"].contains(thread.status)
                    let sameGoal = thread.messages.first(where: { $0.kind == "goal" })?.content == objective
                    return canRetry && sameGoal ? thread : nil
                }
                let thread: TaskThreadProjection
                if let reusableThread {
                    thread = reusableThread
                } else {
                    thread = try await service.taskThreadCreate(String(objective.prefix(60)), objective)
                }
                proposalThreadID = thread.id
                guard proposalGeneration == generation,
                      activeThread?.id == selectedThreadID else { return }
                activeThread = thread
                proposalState = .generating
                let proposal = try await service.taskProposalGenerate(thread.id, preferredAgentID)
                guard canApplyProposalOperation(generation, threadID: thread.id) else { return }
                proposalState = .review(proposal)
                await restoreThreads()
            } catch {
                let isCurrentThread = proposalThreadID.map { activeThread?.id == $0 }
                    ?? (activeThread?.id == selectedThreadID)
                guard proposalGeneration == generation, isCurrentThread else { return }
                proposalState = .failure(code: RuntimeService.taskProposalErrorCode(from: error))
                historyError = error.localizedDescription
            }
        }
    }

    func answerProposalQuestion(_ input: String) {
        guard let thread = activeThread, !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isSubmitting else { return }
        let threadID = thread.id
        isSubmitting = true
        historyError = nil
        let generation = beginProposalOperation(.generating)
        Task {
            defer { isSubmitting = false }
            do {
                let updatedThread = try await service.taskThreadMessage(threadID, input)
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                activeThread = updatedThread
                proposalState = .generating
                let proposal = try await service.taskProposalGenerate(threadID, nil)
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                proposalState = .review(proposal)
                await restoreThreads()
            } catch {
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                proposalState = .failure(code: RuntimeService.taskProposalErrorCode(from: error))
                historyError = error.localizedDescription
            }
        }
    }

    func cancelWorkConfirmation() {
        invalidateProposalOperations()
        proposalState = activeThread.map {
            .initial(threadStatus: $0.status, proposal: nil)
        } ?? .idle
    }

    func selectThread(_ thread: TaskThreadProjection?) {
        let previousThreadID = activeThread?.id
        activeThread = thread
        guard previousThreadID != thread?.id else {
            if thread == nil {
                invalidateProposalOperations()
                proposalState = .idle
            }
            return
        }
        invalidateProposalOperations()
        proposalState = thread.map {
            .initial(threadStatus: $0.status, proposal: nil)
        } ?? .idle
        if let thread, ["awaiting_input", "awaiting_confirmation"].contains(thread.status) {
            Task { await restoreProposal(for: thread) }
        }
    }

    func restoreProposal(for thread: TaskThreadProjection) async {
        let threadID = thread.id
        guard activeThread?.id == threadID else { return }
        let generation = beginProposalOperation(.restoring)
        do {
            let proposal = try await service.taskProposalCurrent(threadID)
            guard canApplyProposalOperation(generation, threadID: threadID) else { return }
            proposalState = .review(proposal)
        } catch {
            guard canApplyProposalOperation(generation, threadID: threadID) else { return }
            let code = RuntimeService.taskProposalErrorCode(from: error)
            switch code {
            case "task_proposal_expired", "task_proposal_stale":
                proposalState = .recoverable(message: "员工或能力状态已经变化，请重新生成方案。")
            case "task_proposal_not_found":
                proposalState = .recoverable(message: "上次方案未完成，可以重新生成。")
            default:
                proposalState = .failure(code: code)
            }
        }
    }

    func regenerateProposal() {
        guard !isSubmitting,
              let thread = activeThread,
              ["drafting", "awaiting_input", "awaiting_confirmation"].contains(thread.status) else { return }
        let threadID = thread.id
        isSubmitting = true
        historyError = nil
        let generation = beginProposalOperation(.generating)
        Task {
            defer { isSubmitting = false }
            do {
                let proposal = try await service.taskProposalRegenerate(threadID)
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                proposalState = .review(proposal)
                await restoreThreads()
            } catch {
                guard canApplyProposalOperation(generation, threadID: threadID) else { return }
                proposalState = .failure(code: RuntimeService.taskProposalErrorCode(from: error))
                historyError = error.localizedDescription
            }
        }
    }

    func sendTaskRoomMessage(_ input: String) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let thread = activeThread, !isSubmitting else { return }
        if ["drafting", "awaiting_input"].contains(thread.status) {
            answerProposalQuestion(text)
            return
        }
        guard let execution = thread.execution,
              let work = execution.workOrders.first(where: { $0.runPhase == "waiting_user" }),
              let runID = work.runID else {
            historyError = "当前没有等待回复的员工。执行进展、审批和交付会继续显示在这个 Task 中。"
            return
        }
        isSubmitting = true
        historyError = nil
        Task {
            defer { isSubmitting = false }
            do {
                let data = try JSONSerialization.data(withJSONObject: ["text": text])
                _ = try await service.continueRun(runID, true, String(decoding: data, as: UTF8.self))
                _ = try await service.businessFlowContinue(execution.id, nil)
                await restoreHistory()
                await restoreThreads()
            } catch { historyError = error.localizedDescription }
        }
    }

    func retryHistory() {
        Task { await restoreHistory() }
    }

    func cancel(_ id: String) {
        guard let run = runs.first(where: { $0.id == id }), run.status == .running, !run.isCancellationRequested else { return }
        update(id) { $0.isCancellationRequested = true; $0.error = nil }
        Task {
            do { try await service.cancel(id) }
            catch {
                update(id) { $0.isCancellationRequested = false; $0.error = error.localizedDescription }
            }
        }
    }

    func resolveApproval(for run: TaskRun, approve: Bool) {
        guard let runID = run.runID else { return }
        guard !approvalRunsInFlight.contains(runID) else { return }
        approvalRunsInFlight.insert(runID)
        update(run.id) { $0.error = nil }
        Task {
            defer { approvalRunsInFlight.remove(runID) }
            do {
                let result = try await service.continueRun(runID, approve, nil)
                await restoreHistory()
                if result.status == "succeeded", result.phase == "terminal" {
                    NotificationCenter.default.post(name: .taskRunDidComplete, object: nil)
                }
            } catch { update(run.id) { $0.error = error.localizedDescription } }
        }
    }

    func isResolvingApproval(for run: TaskRun) -> Bool {
        run.runID.map(approvalRunsInFlight.contains) ?? false
    }

    func resolveApproval(for workOrder: WorkOrderProjection, in flow: BusinessFlowProjection, approve: Bool) {
        guard let runID = workOrder.runID else { return }
        guard !approvalRunsInFlight.contains(runID) else { return }
        approvalRunsInFlight.insert(runID)
        historyError = nil
        Task {
            defer { approvalRunsInFlight.remove(runID) }
            do {
                _ = try await service.continueRun(runID, approve, nil)
                if approve {
                    _ = try await service.businessFlowContinue(flow.id, nil)
                }
                await restoreHistory()
                await restoreThreads()
            } catch { historyError = error.localizedDescription }
        }
    }

    func isResolvingApproval(for workOrder: WorkOrderProjection) -> Bool {
        workOrder.runID.map(approvalRunsInFlight.contains) ?? false
    }

    func resolveUnknown(_ actionID: String, for run: TaskRun, succeeded: Bool) {
        Task {
            do {
                _ = try await service.resolveUnknown(actionID, succeeded ? "succeeded" : "failed")
                await restoreHistory()
            } catch { update(run.id) { $0.error = error.localizedDescription } }
        }
    }

    private func update(_ id: String, mutation: (inout TaskRun) -> Void) {
        guard let index = runs.firstIndex(where: { $0.id == id }) else { return }
        mutation(&runs[index])
    }

    private func replace(_ id: String, with run: TaskRun) {
        guard let index = runs.firstIndex(where: { $0.id == id }) else { return }
        runs[index] = run
    }

    private func restoreHistory() async {
        historyError = nil
        do {
            let previousPersistedIDs = Set(runs.filter { $0.status != .running }.map(\.id))
            let history = try await service.loadHistory()
            let persistedRuns = history.tasks.map { item in
                TaskRun(id: item.taskID, agentID: item.agentID, input: item.input, createdAt: item.createdAt, updatedAt: item.updatedAt, status: item.status, actions: item.actions, events: item.events, response: nil, error: nil, artifactPath: item.verifiedArtifactPath ?? item.artifactPath, evaluation: item.evaluation, isCancellationRequested: item.cancellationRequested, runID: item.runID, runPhase: item.runPhase, waitingReason: item.waitingReason, stopReason: item.stopReason, deliverableTitle: item.deliverableTitle, deliverableStatus: item.deliverableStatus, verifiedArtifactPath: item.verifiedArtifactPath, conversationID: item.conversationID, skillID: item.skillID, skillVersion: item.skillVersion, skillIDs: item.skillIDs, deliverableMessage: item.deliverableMessage)
            }
            let persistedIDs = Set(persistedRuns.map(\.id))
            let optimisticRuns = runs.filter { !persistedIDs.contains($0.id) && $0.status == .running }
            runs = optimisticRuns + persistedRuns
            if let newestNewRun = persistedRuns.first(where: { !previousPersistedIDs.contains($0.id) }) {
                selection = newestNewRun.id
            } else if selection == nil || !runs.contains(where: { $0.id == selection }) {
                selection = runs.first?.id
            }
            for run in runs where run.status == .running { monitorRestoredTask(run.id) }
        } catch {
            historyError = error.localizedDescription
            logger.error("Could not restore task history")
        }
        do {
            usage = try await service.loadUsageSummary().officeSummary
        } catch {
            usage = nil
            logger.error("Could not load usage summary")
        }
    }

    private func restoreThreads() async {
        let selectedThreadID = activeThread?.id
        do {
            async let active = service.taskThreadList(false)
            async let archived = service.taskThreadList(true)
            let refreshedThreads = try await active
            let refreshedArchivedThreads = try await archived
            taskThreads = refreshedThreads
            archivedTaskThreads = refreshedArchivedThreads
            guard activeThread?.id == selectedThreadID else { return }
            if let selectedThreadID,
               let refreshedThread = refreshedThreads.first(where: { $0.id == selectedThreadID }) {
                activeThread = refreshedThread
            } else {
                selectThread(refreshedThreads.first)
            }
        } catch {
            logger.error("Could not restore task threads")
        }
    }

    func archiveThread(_ thread: TaskThreadProjection) {
        retainThread(thread, operation: "archive")
    }

    func restoreThread(_ thread: TaskThreadProjection) {
        retainThread(thread, operation: "restore")
    }

    func deleteThread(_ thread: TaskThreadProjection) {
        retainThread(thread, operation: "delete")
    }

    private func retainThread(_ thread: TaskThreadProjection, operation: String) {
        guard !isSubmitting else { return }
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                _ = try await service.taskThreadRetention(thread.id, operation)
                if activeThread?.id == thread.id { selectThread(nil) }
                await restoreThreads()
            } catch {
                historyError = error.localizedDescription
            }
        }
    }

    private func monitorRestoredTask(_ id: String) {
        guard restoredTaskMonitors[id] == nil else { return }
        restoredTaskMonitors[id] = Task { [weak self] in
            guard let self else { return }
            var cursor = self.runs.first(where: { $0.id == id })?.events.map(\.sequence).max() ?? 0
            while !Task.isCancelled {
                do {
                    let response = try await self.service.events(id, cursor)
                    if !response.events.isEmpty {
                        self.append(response.events, to: id)
                        cursor = response.events.map(\.sequence).max() ?? cursor
                    }
                    let history = try await self.service.loadHistory()
                    guard let item = history.tasks.first(where: { $0.taskID == id }) else { break }
                    self.apply(item)
                    if item.status != .running { break }
                } catch {
                    self.update(id) { $0.error = error.localizedDescription }
                }
                try? await Task.sleep(for: .milliseconds(500))
            }
            self.restoredTaskMonitors[id] = nil
        }
    }

    private func apply(_ item: TaskHistoryResponse.Item) {
        update(item.taskID) { run in
            run.status = item.status
            run.updatedAt = item.updatedAt
            run.actions = item.actions
            run.events = item.events
            run.artifactPath = item.artifactPath
            run.evaluation = item.evaluation
            run.isCancellationRequested = item.cancellationRequested
            run.runID = item.runID
            run.runPhase = item.runPhase
            run.waitingReason = item.waitingReason
            run.stopReason = item.stopReason
            run.deliverableTitle = item.deliverableTitle
            run.deliverableStatus = item.deliverableStatus
            run.verifiedArtifactPath = item.verifiedArtifactPath
            run.skillID = item.skillID
            run.skillVersion = item.skillVersion
            run.skillIDs = item.skillIDs
            run.deliverableMessage = item.deliverableMessage
            if item.status != .running { run.error = nil }
        }
    }

    private func append(_ events: [RuntimeEvent], to id: String) {
        update(id) { run in
            let known = Set(run.events.map(\.eventID))
            run.events.append(contentsOf: events.filter { !known.contains($0.eventID) })
        }
    }


    private func pollEvents(for id: String) async {
        var cursor = 0
        while !Task.isCancelled {
            do {
                let response = try await service.events(id, cursor)
                if !response.events.isEmpty {
                    update(id) { run in
                        let known = Set(run.events.map(\.eventID))
                        run.events.append(contentsOf: response.events.filter { !known.contains($0.eventID) })
                    }
                    cursor = response.events.map(\.sequence).max() ?? cursor
                }
            } catch {
                if !Task.isCancelled { logger.error("Could not resume task events") }
            }
            try? await Task.sleep(for: .milliseconds(300))
        }
    }
}
