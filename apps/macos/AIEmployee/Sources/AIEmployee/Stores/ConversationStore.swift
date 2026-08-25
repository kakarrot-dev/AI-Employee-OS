import Foundation
import Combine
import OSLog

extension Notification.Name {
    static let taskRunDidComplete = Notification.Name("AIEmployee.taskRunDidComplete")
}

@MainActor
final class ConversationStore: ObservableObject {
    private let service: RuntimeService
    private let logger = Logger(subsystem: "com.kakarrot.ai-employee-os", category: "Conversation")
    @Published private(set) var employeeID = ""
    @Published private(set) var employeeName = ""
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var isSending = false
    @Published private(set) var isStopping = false
    @Published private(set) var streamingContent = ""
    @Published private(set) var streamingStartedAt: Date?
    @Published var error: String?
    @Published private(set) var lastActivityByEmployee: [String: String] = [:]
    @Published private(set) var latestPreviewByEmployee: [String: String] = [:]
    @Published private(set) var pendingTaskRefresh = false
    private var selectionGeneration = 0
    private var sendTask: Task<Void, Never>?
    private var cancellables: Set<AnyCancellable> = []

    init(service: RuntimeService) {
        self.service = service
        NotificationCenter.default.publisher(for: .taskRunDidComplete)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { await self.reload() }
            }
            .store(in: &cancellables)
        if let demo = WorkLibraryDemoData.current {
            employeeID = "001"
            employeeName = "悟空"
            messages = demo.messages[employeeID] ?? []
            lastActivityByEmployee = demo.lastActivity
            latestPreviewByEmployee = demo.previews
            return
        }
        Task { await reload() }
    }

    private var conversationID: String { "conversation_\(employeeID)_primary" }

    var latestUserMessageID: String? {
        messages.last(where: { $0.role == "user" })?.id
    }

    func select(employee: Employee) {
        guard employeeID != employee.id else { employeeName = employee.name; return }
        selectionGeneration += 1
        employeeID = employee.id
        employeeName = employee.name
        messages = []
        draft = ""
        isSending = false
        isStopping = false
        streamingContent = ""
        streamingStartedAt = nil
        error = nil
        if let demo = WorkLibraryDemoData.current {
            messages = demo.messages[employee.id] ?? []
            return
        }
        let generation = selectionGeneration
        let targetConversationID = conversationID
        Task { await reload(generation: generation, conversationID: targetConversationID) }
    }

    func reload() async {
        await reload(generation: selectionGeneration, conversationID: conversationID)
    }

    func preloadSummaries(for employees: [Employee]) async {
        guard WorkLibraryDemoData.current == nil else { return }
        for employee in employees where lastActivityByEmployee[employee.id] == nil {
            do {
                let history = try await service.chatHistory("conversation_\(employee.id)_primary", employee.id).messages
                if let latest = history.max(by: { $0.createdAt < $1.createdAt }) {
                    lastActivityByEmployee[employee.id] = latest.createdAt
                    latestPreviewByEmployee[employee.id] = latest.content
                }
            } catch {
                continue
            }
        }
    }

    func send() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isSending else { return }
        if submit(content, replacing: nil) { draft = "" }
    }

    @discardableResult
    func reviseLatestUserMessage(id: String, content: String) -> Bool {
        let revised = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !revised.isEmpty, !isSending, id == latestUserMessageID else { return false }
        return submit(revised, replacing: id)
    }

    private func submit(_ content: String, replacing messageID: String?) -> Bool {
        guard !employeeID.isEmpty else { error = "请先选择一名员工。"; return false }
        let generation = selectionGeneration
        let targetEmployeeID = employeeID
        let targetConversationID = conversationID
        isSending = true; error = nil
        streamingContent = ""; streamingStartedAt = .now
        let optimistic = ChatMessage(id: "local_\(UUID().uuidString)", role: "user", content: content, createdAt: ISO8601DateFormatter().string(from: .now))
        if let messageID, let index = messages.firstIndex(where: { $0.id == messageID }) {
            messages = Array(messages[..<index]) + [optimistic]
        } else {
            messages.append(optimistic)
        }
        logger.info("User message queued locally for employee \(targetEmployeeID, privacy: .public)")
        sendTask = Task {
            do {
                let response = try await service.chatSend(targetConversationID, targetEmployeeID, content, "", messageID) { [weak self] delta in
                    guard let self,
                          generation == self.selectionGeneration,
                          targetConversationID == self.conversationID else { return }
                    self.streamingContent += delta
                }
                logger.info("Assistant response received for employee \(targetEmployeeID, privacy: .public)")
                await reload(generation: generation, conversationID: targetConversationID)
                if generation == selectionGeneration, targetConversationID == conversationID,
                   response.routedTo == "task" {
                    pendingTaskRefresh = true
                }
            } catch {
                if Task.isCancelled {
                    logger.info("Assistant response stopped for employee \(targetEmployeeID, privacy: .public)")
                } else {
                    logger.error("Assistant response failed for employee \(targetEmployeeID, privacy: .public)")
                }
                if !Task.isCancelled, generation == selectionGeneration, targetConversationID == conversationID {
                    self.error = error.localizedDescription
                }
                await reload(generation: generation, conversationID: targetConversationID)
            }
                if generation == selectionGeneration, targetConversationID == conversationID, !isStopping {
                    isSending = false
                    streamingContent = ""
                    streamingStartedAt = nil
                sendTask = nil
            }
        }
        return true
    }

    func stopSending() {
        guard isSending else { return }
        let targetConversationID = conversationID
        let targetEmployeeID = employeeID
        isStopping = true
        sendTask?.cancel()
        streamingContent = ""
        streamingStartedAt = nil
        Task {
            try? await service.chatAbort(targetConversationID, targetEmployeeID)
            await reload()
            if targetConversationID == conversationID {
                isSending = false
                isStopping = false
                sendTask = nil
            }
        }
    }

    func clearPendingTaskRefresh() { pendingTaskRefresh = false }

    func deleteHistory() async {
        guard !isSending else { return }
        let generation = selectionGeneration
        let targetConversationID = conversationID
        let targetEmployeeID = employeeID
        do {
            _ = try await service.chatDelete(targetConversationID, targetEmployeeID)
            if generation == selectionGeneration, targetConversationID == conversationID {
                messages = []
                error = nil
            }
        } catch {
            if generation == selectionGeneration, targetConversationID == conversationID {
                self.error = error.localizedDescription
            }
        }
    }

    @discardableResult
    func archiveHistory() async -> Bool {
        guard !isSending, !messages.isEmpty else { return false }
        let generation = selectionGeneration
        let targetConversationID = conversationID
        let targetEmployeeID = employeeID
        do {
            _ = try await service.chatRetention(targetConversationID, targetEmployeeID, "archive")
            guard generation == selectionGeneration, targetConversationID == conversationID else { return false }
            messages = []
            latestPreviewByEmployee[targetEmployeeID] = nil
            lastActivityByEmployee[targetEmployeeID] = nil
            error = nil
            return true
        } catch {
            if generation == selectionGeneration, targetConversationID == conversationID {
                self.error = error.localizedDescription
            }
            return false
        }
    }

    private func reload(generation: Int, conversationID targetConversationID: String) async {
        guard !employeeID.isEmpty else {
            messages = []
            return
        }
        do {
            let targetEmployeeID = employeeID
            let loaded = try await service.chatHistory(targetConversationID, targetEmployeeID).messages
            guard generation == selectionGeneration, targetConversationID == conversationID else { return }
            messages = loaded
            if let latest = loaded.max(by: { $0.createdAt < $1.createdAt }) {
                lastActivityByEmployee[employeeID] = latest.createdAt
                latestPreviewByEmployee[employeeID] = latest.content
            }
        } catch {
            guard generation == selectionGeneration, targetConversationID == conversationID else { return }
            self.error = error.localizedDescription
        }
    }
}
