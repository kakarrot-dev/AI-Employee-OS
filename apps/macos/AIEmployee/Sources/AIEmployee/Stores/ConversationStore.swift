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

    init(service: RuntimeService) {
        self.service = service
        Task { await reload() }
    }

    private var conversationID: String { "conversation_\(employeeID)_primary" }

    func select(employee: Employee) {
        guard employeeID != employee.id else { employeeName = employee.name; return }
        employeeID = employee.id
        employeeName = employee.name
        messages = []
        error = nil
        Task { await reload() }
    }

    func reload() async {
        do { messages = try await service.chatHistory(conversationID).messages }
        catch { self.error = error.localizedDescription }
    }

    func send() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isSending else { return }
        guard let key = KeychainService.load() else { error = "请先在设置中保存 DeepSeek API Key。"; return }
        draft = ""; isSending = true; error = nil
        let optimistic = ChatMessage(id: "local_\(UUID().uuidString)", role: "user", content: content, createdAt: ISO8601DateFormatter().string(from: .now))
        messages.append(optimistic)
        Task {
            do {
                _ = try await service.chatSend(conversationID, employeeID, content, key)
                await reload()
            } catch {
                self.error = error.localizedDescription
                await reload()
            }
            isSending = false
        }
    }

    func deleteHistory() async {
        guard !isSending else { return }
        do {
            _ = try await service.chatDelete(conversationID)
            messages = []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
