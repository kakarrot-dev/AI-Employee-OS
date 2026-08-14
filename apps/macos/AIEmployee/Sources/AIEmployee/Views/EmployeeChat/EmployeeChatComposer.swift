import SwiftUI

struct EmployeeChatComposer: View {
    @ObservedObject var conversationStore: ConversationStore
    let employeeName: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            if let error = conversationStore.error {
                UXInlineFeedback(message: error)
                    .textSelection(.enabled)
                    .padding(.horizontal, AppTheme.Spacing.sm)
            }

            CreamComposer(
                "给 \(employeeName) 发消息…",
                text: $conversationStore.draft,
                accessibilityLabel: "给 \(employeeName) 发消息",
                size: .compact,
                maxWidth: AppTheme.Typography.readingMeasure,
                isInputEnabled: !conversationStore.isStopping,
                actionState: conversationStore.isSending ? .stop : .submit,
                isActionEnabled: conversationStore.isSending ? !conversationStore.isStopping : canSubmit,
                actionHelp: conversationStore.isSending ? "停止本轮回复" : "发送消息",
                onAction: composerAction,
                leadingActions: { EmptyView() },
                status: { replyStatus }
            )
        }
        .frame(maxWidth: AppTheme.Typography.readingMeasure)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var replyStatus: some View {
        if conversationStore.isSending {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text(conversationStore.isStopping ? "正在停止…" : "\(employeeName) 正在回复…")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
                ProgressView().controlSize(.small)
            }
        }
    }

    private var canSubmit: Bool {
        !conversationStore.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !conversationStore.isSending
    }

    private func composerAction() {
        if conversationStore.isSending {
            conversationStore.stopSending()
        } else if canSubmit {
            conversationStore.send()
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
