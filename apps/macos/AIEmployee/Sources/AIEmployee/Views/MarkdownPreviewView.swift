import SwiftUI

struct MarkdownPreviewView: View {
    let path: String
    @State private var state: PreviewState = .loading
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("交付文档")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(palette.primary)
                    Text("PRD")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(palette.ink)
                }
                Spacer()
                Label("本地产物", systemImage: "lock.doc.fill")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            }

            Group {
                switch state {
                case .loading:
                    HStack(spacing: AppTheme.Spacing.xs) {
                        ProgressView().controlSize(.small)
                        Text("正在读取本地产物…").foregroundStyle(palette.muted)
                    }
                case .loaded(let content):
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                        ForEach(Array(MarkdownBlock.parse(content).enumerated()), id: \.offset) { _, block in
                            markdownBlock(block)
                        }
                    }
                    .textSelection(.enabled)
                case .failed(let message):
                    Label(message, systemImage: "doc.badge.ellipsis")
                        .foregroundStyle(palette.muted)
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AppTheme.Spacing.lg)
            .background(palette.surfaceCard)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        }
        .task(id: path) {
            state = .loading
            do { state = .loaded(try await ArtifactService.loadMarkdown(at: path)) }
            catch { state = .failed(error.localizedDescription) }
        }
    }

    @ViewBuilder
    private func markdownBlock(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            Text(inlineMarkdown(text))
                .font(headingFont(level))
                .foregroundStyle(palette.ink)
                .padding(.top, level == 1 ? 4 : 8)
        case .bullet(let text):
            HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.xs) {
                Text("•").foregroundStyle(palette.muted)
                Text(inlineMarkdown(text))
            }
        case .numbered(let text):
            HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.xs) {
                Image(systemName: "circle.fill").font(.system(size: 4)).foregroundStyle(palette.muted)
                Text(inlineMarkdown(text))
            }
        case .quote(let text):
            Text(inlineMarkdown(text))
                .foregroundStyle(palette.muted)
                .padding(.leading, AppTheme.Spacing.md)
                .overlay(alignment: .leading) {
                    Rectangle().fill(palette.primary).frame(width: 2)
                }
        case .code(let text):
            ScrollView(.horizontal) {
                Text(text)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .padding(AppTheme.Spacing.sm)
            }
            .background(palette.surfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous))
        case .divider:
            Divider().overlay(palette.hairlineSoft)
        case .spacing:
            Spacer().frame(height: 2)
        case .paragraph(let text):
            Text(inlineMarkdown(text)).font(.body).lineSpacing(5)
        }
    }

    private func inlineMarkdown(_ source: String) -> AttributedString {
        (try? AttributedString(markdown: source, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(source)
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: .title2.weight(.semibold)
        case 2: .headline
        default: .subheadline.weight(.semibold)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }

    private enum PreviewState {
        case loading
        case loaded(String)
        case failed(String)
    }
}
