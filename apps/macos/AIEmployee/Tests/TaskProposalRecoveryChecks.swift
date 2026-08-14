import Combine
import Foundation

@main
enum TaskProposalRecoveryChecks {
    @MainActor
    static func main() async {
        let selectedCheck = ProcessInfo.processInfo.arguments.dropFirst().first
        if selectedCheck != "late-current" {
            await answerRefreshesActiveThreadFromRuntimeProjection()
        }
        if selectedCheck != "answer-refresh" {
            await lateCurrentCannotOverwriteRegeneratedReview()
        }
        print("task proposal recovery checks passed")
    }

    @MainActor
    private static func answerRefreshesActiveThreadFromRuntimeProjection() async {
        let drafting = thread(status: "drafting")
        let latest = thread(status: "awaiting_confirmation")
        let generated = proposal(id: "generated")
        let service = makeService(
            taskThreadList: { archived in archived ? [] : [latest] },
            taskThreadMessage: { _, _ in drafting },
            taskProposalGenerate: { _, _ in generated }
        )
        let store = TaskStore(service: service, restoresOnInit: false)
        store.selectThread(drafting)

        let completed = Task { @MainActor in await waitForSubmission(store) }
        store.answerProposalQuestion("目标用户是独立开发者")
        await completed.value

        expect(
            store.activeThread?.status == "awaiting_confirmation",
            "answer applies the authoritative Runtime thread projection"
        )
        expect(
            store.proposalState == .review(generated),
            "answer preserves generated proposal review after refreshing the thread"
        )
    }

    @MainActor
    private static func lateCurrentCannotOverwriteRegeneratedReview() async {
        let awaitingConfirmation = thread(status: "awaiting_confirmation")
        let latest = thread(status: "running")
        let old = proposal(id: "old")
        let regenerated = proposal(id: "regenerated")
        let gate = ProposalGate()
        let currentStarted = Signal()
        let refreshAllowed = Signal()
        let service = makeService(
            taskThreadList: { archived in
                guard !archived else { return [] }
                await refreshAllowed.wait()
                return [latest]
            },
            taskProposalCurrent: { _ in
                await currentStarted.fire()
                return try await gate.wait()
            },
            taskProposalRegenerate: { _ in regenerated }
        )
        let store = TaskStore(service: service, restoresOnInit: false)
        store.selectThread(thread(status: "drafting"))

        let oldRestore = Task { await store.restoreProposal(for: awaitingConfirmation) }
        await currentStarted.wait()

        let completed = Task { @MainActor in await waitForSubmission(store) }
        let newReviewApplied = Task { @MainActor in
            await waitForProposal(.review(regenerated), in: store)
        }
        store.regenerateProposal()
        await newReviewApplied.value

        await gate.succeed(old)
        await oldRestore.value
        let lateCurrentWasIgnored = store.proposalState == .review(regenerated)
        await refreshAllowed.fire()
        await completed.value

        expect(
            lateCurrentWasIgnored,
            "late current cannot overwrite the regenerated proposal review"
        )
        expect(
            store.proposalState == .review(regenerated),
            "same-thread refresh preserves the regenerated proposal review"
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
        guard condition() else {
            FileHandle.standardError.write(Data("task proposal recovery check failed: \(name)\n".utf8))
            exit(1)
        }
    }
}

private enum TestFailure: Error {
    case unimplemented
}

private actor ProposalGate {
    private var continuation: CheckedContinuation<TaskProposalResponse, Error>?
    private var pending: TaskProposalResponse?

    func wait() async throws -> TaskProposalResponse {
        if let pending {
            self.pending = nil
            return pending
        }
        return try await withCheckedThrowingContinuation { continuation = $0 }
    }

    func succeed(_ proposal: TaskProposalResponse) {
        if let continuation {
            self.continuation = nil
            continuation.resume(returning: proposal)
        } else {
            pending = proposal
        }
    }
}

private actor Signal {
    private var fired = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func fire() {
        fired = true
        let pending = waiters
        waiters.removeAll()
        pending.forEach { $0.resume() }
    }

    func wait() async {
        guard !fired else { return }
        await withCheckedContinuation { waiters.append($0) }
    }
}

@MainActor
private func waitForSubmission(_ store: TaskStore) async {
    var observedSubmitting = store.isSubmitting
    for await isSubmitting in store.$isSubmitting.values {
        if isSubmitting {
            observedSubmitting = true
        } else if observedSubmitting {
            return
        }
    }
}

@MainActor
private func waitForProposal(_ expected: TaskProposalPresentationState, in store: TaskStore) async {
    for await state in store.$proposalState.values where state == expected {
        return
    }
}

private func makeService(
    taskThreadList: @escaping @Sendable (Bool) async throws -> [TaskThreadProjection],
    taskThreadMessage: @escaping @Sendable (String, String) async throws -> TaskThreadProjection = { _, _ in throw TestFailure.unimplemented },
    taskProposalGenerate: @escaping @Sendable (String, String?) async throws -> TaskProposalResponse = { _, _ in throw TestFailure.unimplemented },
    taskProposalCurrent: @escaping @Sendable (String) async throws -> TaskProposalResponse = { _ in throw TestFailure.unimplemented },
    taskProposalRegenerate: @escaping @Sendable (String) async throws -> TaskProposalResponse = { _ in throw TestFailure.unimplemented }
) -> RuntimeService {
    RuntimeService(
        recover: {},
        loadHistory: { throw TestFailure.unimplemented },
        loadUsageSummary: { throw TestFailure.unimplemented },
        events: { _, _ in throw TestFailure.unimplemented },
        cancel: { _ in throw TestFailure.unimplemented },
        continueRun: { _, _, _ in throw TestFailure.unimplemented },
        resolveUnknown: { _, _ in throw TestFailure.unimplemented },
        chatHistory: { _, _ in throw TestFailure.unimplemented },
        chatSend: { _, _, _, _, _, _ in throw TestFailure.unimplemented },
        chatAbort: { _, _ in throw TestFailure.unimplemented },
        chatDelete: { _, _ in throw TestFailure.unimplemented },
        chatRetention: { _, _, _ in throw TestFailure.unimplemented },
        archiveList: { throw TestFailure.unimplemented },
        employeeList: { throw TestFailure.unimplemented },
        employeeSave: { _ in throw TestFailure.unimplemented },
        employeeDelete: { _ in throw TestFailure.unimplemented },
        effectivePrompt: { _ in throw TestFailure.unimplemented },
        capabilities: { throw TestFailure.unimplemented },
        skillsList: { _ in throw TestFailure.unimplemented },
        toolsList: { throw TestFailure.unimplemented },
        knowledgeList: { throw TestFailure.unimplemented },
        bindSkill: { _, _, _ in throw TestFailure.unimplemented },
        unbindSkill: { _, _ in throw TestFailure.unimplemented },
        taskThreadCreate: { _, _ in throw TestFailure.unimplemented },
        taskThreadList: taskThreadList,
        taskThreadMessage: taskThreadMessage,
        taskThreadRetention: { _, _ in throw TestFailure.unimplemented },
        taskProposalGenerate: taskProposalGenerate,
        taskProposalCurrent: taskProposalCurrent,
        taskProposalRegenerate: taskProposalRegenerate,
        taskProposalConfirm: { _, _ in throw TestFailure.unimplemented },
        scenarioList: { throw TestFailure.unimplemented },
        scenarioPropose: { _, _ in throw TestFailure.unimplemented },
        scenarioSave: { _, _, _ in throw TestFailure.unimplemented },
        businessFlowPlan: { _ in throw TestFailure.unimplemented },
        businessFlowStart: { _, _, _ in throw TestFailure.unimplemented },
        businessFlowList: { throw TestFailure.unimplemented },
        businessFlowContinue: { _, _ in throw TestFailure.unimplemented }
    )
}

private func thread(status: String) -> TaskThreadProjection {
    TaskThreadProjection(
        schemaVersion: "1.0.0",
        id: "thread-1",
        title: "产品调研",
        status: status,
        currentRevision: 1,
        rootTaskID: nil,
        execution: nil,
        createdAt: "1",
        updatedAt: "2",
        archivedAt: nil,
        messages: [],
        room: TaskRoomTimeline(
            schemaVersion: "1.0.0",
            threadID: "thread-1",
            participants: [],
            items: []
        )
    )
}

private func proposal(id: String) -> TaskProposalResponse {
    TaskProposalResponse(
        proposalID: id,
        threadID: "thread-1",
        proposalHash: "hash-\(id)",
        requiresConfirmation: true,
        resolvedAssignments: [],
        proposal: .init(
            intent: "single_agent_task",
            title: "产品调研",
            objective: "形成调研方案",
            assignments: [],
            missingInputs: []
        )
    )
}
