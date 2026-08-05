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
    private var selectionGeneration = 0

    init(service: RuntimeService) {
        self.service = service
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
        let generation = selectionGeneration
        let targetConversationID = conversationID
        Task { await reload(generation: generation, conversationID: targetConversationID) }
    }

    func reload() async {
        await reload(generation: selectionGeneration, conversationID: conversationID)
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
                _ = try await service.chatSend(targetConversationID, targetEmployeeID, content, key)
                await reload(generation: generation, conversationID: targetConversationID)
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
        } catch {
            guard generation == selectionGeneration, targetConversationID == conversationID else { return }
            self.error = error.localizedDescription
        }
    }
}
