import Foundation

@MainActor
final class ArchiveStore: ObservableObject {
    private let service: RuntimeService
    @Published private(set) var conversations: [ArchivedConversation] = []
    @Published private(set) var isLoading = false
    @Published var error: String?

    init(service: RuntimeService = .live()) { self.service = service }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            conversations = try await service.archiveList().conversations
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func restore(_ conversation: ArchivedConversation) async {
        await retain(conversation, operation: "restore")
    }

    func delete(_ conversation: ArchivedConversation) async {
        do {
            _ = try await service.chatDelete(conversation.conversationID, conversation.employeeID)
            conversations.removeAll { $0.id == conversation.id }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func retain(_ conversation: ArchivedConversation, operation: String) async {
        do {
            _ = try await service.chatRetention(conversation.conversationID, conversation.employeeID, operation)
            conversations.removeAll { $0.id == conversation.id }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
