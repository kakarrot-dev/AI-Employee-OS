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
    @Published var awaitingApproval = false
    @Published private(set) var historyError: String?

    @Published private(set) var isSubmitting = false
    private var restoredTaskMonitors: [String: Task<Void, Never>] = [:]

    init(service: RuntimeService) {
        self.service = service
        Task { await restoreHistory() }
    }

    func presentCommandPalette() {
        isCommandPalettePresented = true
    }

    func prepareInlineTask() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        requestRun()
    }

    func requestRun() {
        guard !isSubmitting else { return }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        awaitingApproval = true
    }

    func approveAndRun() {
        guard !isSubmitting else { return }
        awaitingApproval = false
        isSubmitting = true
        let id = "task_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        let input = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""
        runs.insert(TaskRun(id: id, input: input, createdAt: ISO8601DateFormatter().string(from: .now), status: .running, actions: [], events: [], response: nil, error: nil, artifactPath: nil, evaluation: nil, isCancellationRequested: false), at: 0)
        selection = id
        logger.info("Started approved task \(id, privacy: .public)")
        Task {
            let eventTask = Task { await pollEvents(for: id) }
            do {
                let response = try await service.run(id, input)
                eventTask.cancel()
                let existingEvents = runs.first(where: { $0.id == id })?.events ?? []
                let known = Set(existingEvents.map(\.eventID))
                let finalEvents = existingEvents + response.events.filter { !known.contains($0.eventID) }
                replace(id, with: TaskRun(id: response.taskID, input: input, createdAt: ISO8601DateFormatter().string(from: .now), status: response.status, actions: response.graph.nodes, events: finalEvents, response: response, error: nil, artifactPath: response.artifactPath, evaluation: response.evaluation, isCancellationRequested: false))
                selection = response.taskID
                isSubmitting = false
                logger.info("Task completed \(response.taskID, privacy: .public) status=\(response.status.rawValue, privacy: .public)")
            } catch {
                eventTask.cancel()
                update(id) { $0.status = .failed; $0.error = error.localizedDescription }
                isSubmitting = false
                logger.error("Task failed \(id, privacy: .public)")
            }
        }
    }

    func cancelApproval() { awaitingApproval = false }

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
            let history = try await service.loadHistory()
            let persistedRuns = history.tasks.map { item in
                TaskRun(id: item.taskID, input: item.input, createdAt: item.createdAt, status: item.status, actions: item.actions, events: item.events, response: nil, error: nil, artifactPath: item.artifactPath, evaluation: item.evaluation, isCancellationRequested: item.cancellationRequested)
            }
            let persistedIDs = Set(persistedRuns.map(\.id))
            let optimisticRuns = runs.filter { !persistedIDs.contains($0.id) && $0.status == .running }
            runs = optimisticRuns + persistedRuns
            if selection == nil { selection = runs.first?.id }
            for run in runs where run.status == .running { monitorRestoredTask(run.id) }
        } catch {
            historyError = error.localizedDescription
            logger.error("Could not restore task history")
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
            run.actions = item.actions
            run.events = item.events
            run.artifactPath = item.artifactPath
            run.evaluation = item.evaluation
            run.isCancellationRequested = item.cancellationRequested
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
