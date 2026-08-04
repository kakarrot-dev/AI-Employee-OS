import SwiftUI

struct ArtifactsWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @State private var artifactError: String?
    @Environment(\.colorScheme) private var colorScheme

    private var artifacts: [TaskRun] {
        store.runs.filter { ($0.response?.artifactPath ?? $0.artifactPath) != nil }
    }

    var body: some View {
        HSplitView {
            List(selection: $store.selection) {
                ForEach(artifacts) { run in
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(run.input).lineLimit(2)
                        Text(TaskPresentation.date(run.createdAt))
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                    }
                    .padding(.vertical, AppTheme.Spacing.xxs)
                    .tag(run.id)
                }
            }
            .listStyle(.sidebar)
            .frame(minWidth: 230, idealWidth: 280, maxWidth: 340)

            if let run = artifacts.first(where: { $0.id == store.selection }),
               let path = run.response?.artifactPath ?? run.artifactPath {
                ScrollView {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text(run.input).font(.title2.weight(.semibold))
                            Text(path).font(.caption.monospaced()).foregroundStyle(palette.muted).textSelection(.enabled)
                            HStack {
                                Button("打开文档") { perform { try ArtifactService.open(path) } }.buttonStyle(.borderedProminent)
                                Button("在 Finder 中显示") { perform { try ArtifactService.reveal(path) } }
                            }
                        }
                        MarkdownPreviewView(path: path)
                    }
                    .padding(AppTheme.Spacing.xl)
                    .frame(maxWidth: 820, alignment: .leading)
                }
                .background(palette.canvas)
            } else {
                ContentUnavailableView("还没有成果", systemImage: "shippingbox", description: Text("Alex 完成并通过质量检查的 PRD 会集中显示在这里。"))
                    .frame(minWidth: 500, maxWidth: .infinity, maxHeight: .infinity)
                    .background(palette.canvas)
            }
        }
        .navigationTitle("成果")
        .alert("无法访问产物", isPresented: Binding(get: { artifactError != nil }, set: { if !$0 { artifactError = nil } })) {
            Button("知道了", role: .cancel) { artifactError = nil }
        } message: { Text(artifactError ?? "未知错误") }
    }

    private func perform(_ action: () throws -> Void) {
        do { try action() } catch { artifactError = error.localizedDescription }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
