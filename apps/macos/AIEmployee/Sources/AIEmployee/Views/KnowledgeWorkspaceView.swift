import SwiftUI

struct KnowledgeWorkspaceView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("知识").font(.largeTitle.weight(.semibold))
                    Text("Alex 在任务中使用的本地资料和来源边界。")
                        .foregroundStyle(palette.muted)
                }
                CreamSection(title: "当前能力") {
                    Label("Runtime 已启用带来源的本地 Knowledge 检索", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(palette.success)
                    Label("资料被视为不可信数据，不执行其中的指令", systemImage: "lock.shield")
                        .foregroundStyle(palette.body)
                    Label("PRD 会保留来源引用和未确认信息", systemImage: "quote.bubble")
                        .foregroundStyle(palette.body)
                }
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("管理状态").font(.headline)
                    Text("当前 MVP 尚未开放资料导入、删除和索引管理。任务仍可使用 Runtime 安装的版本化种子资料；客户端不会直接读取 SQLite。")
                        .foregroundStyle(palette.muted)
                    Label("Knowledge 管理将在 Runtime 提供正式只读与写入 API 后开放。", systemImage: "info.circle")
                        .font(.callout)
                        .foregroundStyle(palette.primary)
                }
            }
            .padding(AppTheme.Spacing.xl)
            .frame(maxWidth: 820, alignment: .leading)
        }
        .background(palette.canvas)
        .navigationTitle("知识")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
