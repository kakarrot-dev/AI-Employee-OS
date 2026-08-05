import SwiftUI

struct AppSidebarView: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @State private var confirmingHistoryDeletion = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            companyHeader

            ScrollView {
                LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    navigationSection
                    recentSection
                }
                .padding(.horizontal, AppTheme.Spacing.xs)
                .padding(.bottom, AppTheme.Spacing.md)
            }

            Divider().overlay(palette.hairlineSoft)
            sidebarButton(
                title: AppDestination.settings.title,
                systemImage: AppDestination.settings.systemImage,
                selected: selection == .settings
            ) {
                selection = .settings
            }
            .padding(.horizontal, AppTheme.Spacing.xs)
            .padding(.vertical, AppTheme.Spacing.xs)
        }
        .background(palette.surfaceSoft)
        .navigationTitle("")
        .confirmationDialog("删除与 Alex 的聊天记录？", isPresented: $confirmingHistoryDeletion, titleVisibility: .visible) {
            Button("删除聊天记录", role: .destructive) {
                Task { await conversationStore.deleteHistory() }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("所有消息和对应模型调用记录都会从本机删除，此操作无法撤销。")
        }
    }

    private var companyHeader: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            ZStack {
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .fill(palette.primary)
                Image(systemName: "building.2.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.onPrimary)
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text("公司")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("AI Employee OS")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
            }

            Spacer(minLength: 0)

            Button { store.presentCommandPalette() } label: {
                Image(systemName: "magnifyingglass")
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .foregroundStyle(palette.muted)
            .help("搜索与命令")
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .frame(height: 54)
    }

    private var navigationSection: some View {
        VStack(spacing: 2) {
            ForEach(AppDestination.allCases.filter { $0 != .settings }) { destination in
                sidebarButton(
                    title: destination.title,
                    systemImage: destination.systemImage,
                    selected: selection == destination && (destination != .work || store.selection == nil)
                ) {
                    if destination == .work { store.selection = nil }
                    selection = destination
                }
            }
        }
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            HStack {
                sectionLabel("最近工作")
                Spacer()
                if !conversationStore.messages.isEmpty {
                    Text("\(conversationStore.messages.count)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(palette.mutedSoft)
                }
            }

            if conversationStore.messages.isEmpty {
                Text("还没有聊天记录")
                    .font(.caption)
                    .foregroundStyle(palette.mutedSoft)
                    .padding(.horizontal, AppTheme.Spacing.xs)
                    .padding(.vertical, 6)
            } else {
                HStack(spacing: AppTheme.Spacing.xxs) {
                    Button {
                        store.selection = nil
                        selection = .work
                    } label: {
                        HStack(spacing: 7) {
                            Circle().fill(palette.success).frame(width: 5, height: 5)
                            Text("与 \(conversationStore.employeeName) 的对话")
                                .font(.caption)
                                .foregroundStyle(palette.body)
                            Spacer(minLength: 0)
                        }
                        .padding(.leading, AppTheme.Spacing.xs)
                        .frame(height: 30)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Button {
                        confirmingHistoryDeletion = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                            .frame(width: 26, height: 26)
                    }
                    .buttonStyle(.plain)
                    .help("删除聊天记录")
                }
                .background(selection == .work ? palette.primary.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm))
            }
        }
    }

    private func sidebarButton(title: String, systemImage: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: systemImage)
                    .frame(width: 16)
                Text(title)
                    .font(.callout.weight(selected ? .medium : .regular))
                Spacer(minLength: 0)
            }
            .foregroundStyle(selected ? palette.ink : palette.body)
            .padding(.horizontal, AppTheme.Spacing.xs)
            .frame(height: 30)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(selected ? palette.primary.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.medium))
            .foregroundStyle(palette.mutedSoft)
            .padding(.horizontal, AppTheme.Spacing.xs)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
