import Foundation
import OSLog
import Combine

@MainActor
final class TaskStore: ObservableObject {
    private let service: RuntimeService
    private let logger = Logger(subsystem: "com.kakarrot.ai-employee-os", category: "Task")
    @Published var runs: [TaskRun] = []
    @Published var selection: UUID?
    @Published var draft = ""
    @Published var isComposing = false
    @Published var awaitingApproval = false

    init(service: RuntimeService) { self.service = service }

    func beginComposing() {
        draft = ""
        isComposing = true
        logger.info("Opened task composer")
    }

    func requestRun() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isComposing = false
        awaitingApproval = true
    }

    func approveAndRun() {
        awaitingApproval = false
        isComposing = false
        let id = UUID()
        let input = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        runs.insert(TaskRun(id: id, input: input, createdAt: .now, status: .running), at: 0)
        selection = id
        logger.info("Started approved task \(id.uuidString, privacy: .public)")
        Task {
            do {
                let response = try await service.run(input)
                update(id) { $0.status = response.status; $0.response = response }
                logger.info("Task completed \(id.uuidString, privacy: .public) status=\(response.status.rawValue, privacy: .public)")
            } catch {
                update(id) { $0.status = .failed; $0.error = error.localizedDescription }
                logger.error("Task failed \(id.uuidString, privacy: .public)")
            }
        }
    }

    func cancelApproval() { awaitingApproval = false }

    private func update(_ id: UUID, mutation: (inout TaskRun) -> Void) {
        guard let index = runs.firstIndex(where: { $0.id == id }) else { return }
        mutation(&runs[index])
    }
}
