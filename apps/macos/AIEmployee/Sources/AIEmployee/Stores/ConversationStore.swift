import Foundation
import Combine

@MainActor
final class ConversationStore: ObservableObject {
    private let service: RuntimeService
    @Published private(set) var employeeID = "ai-product-manager"
    @Published private(set) var employeeName = "Alex"
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var isSending = false
    @Published var error: String?
    @Published private(set) var lastActivityByEmployee: [String: String] = [:]
    @Published private(set) var latestPreviewByEmployee: [String: String] = [:]
    @Published private(set) var pendingTaskRefresh = false
    private var selectionGeneration = 0

    init(service: RuntimeService) {
        self.service = service
        if let demo = WorkLibraryDemoData.current {
            messages = demo.messages[employeeID] ?? []
            lastActivityByEmployee = demo.lastActivity
            latestPreviewByEmployee = demo.previews
            return
        }
        Task { await reload() }
    }

    private var conversationID: String { "conversation_\(employeeID)_primary" }

    func select(employee: Employee) {
        guard employeeID != employee.id else { employeeName = employee.name; return }
        selectionGeneration += 1
        employeeID = employee.id
        employeeName = employee.name
        messages = []
        draft = ""
        isSending = false
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
                let history = try await service.chatHistory("conversation_\(employee.id)_primary").messages
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
        guard let key = KeychainService.load() else { error = "请先在设置中保存 DeepSeek API Key。"; return }
        let generation = selectionGeneration
        let targetEmployeeID = employeeID
        let targetConversationID = conversationID
        draft = ""; isSending = true; error = nil
        let optimistic = ChatMessage(id: "local_\(UUID().uuidString)", role: "user", content: content, createdAt: ISO8601DateFormatter().string(from: .now))
        messages.append(optimistic)
        Task {
            do {
                let response = try await service.chatSend(targetConversationID, targetEmployeeID, content, key)
                await reload(generation: generation, conversationID: targetConversationID)
                if generation == selectionGeneration, targetConversationID == conversationID,
                   response.routedTo == "task" {
                    pendingTaskRefresh = true
                }
            } catch {
                if generation == selectionGeneration, targetConversationID == conversationID {
                    self.error = error.localizedDescription
                }
                await reload(generation: generation, conversationID: targetConversationID)
            }
            if generation == selectionGeneration, targetConversationID == conversationID {
                isSending = false
            }
        }
    }

    func clearPendingTaskRefresh() { pendingTaskRefresh = false }

    func deleteHistory() async {
        guard !isSending else { return }
        let generation = selectionGeneration
        let targetConversationID = conversationID
        do {
            _ = try await service.chatDelete(targetConversationID)
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

    private func reload(generation: Int, conversationID targetConversationID: String) async {
        do {
            let loaded = try await service.chatHistory(targetConversationID).messages
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
