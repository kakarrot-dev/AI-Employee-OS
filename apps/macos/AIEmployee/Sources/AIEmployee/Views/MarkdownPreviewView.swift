import SwiftUI

struct MarkdownPreviewView: View {
    let path: String
    @State private var state: PreviewState = .loading
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        CreamSection(title: "PRD 预览") {
            Group {
                switch state {
                case .loading:
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("正在读取本地产物…").foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                    }
                case .loaded(let content):
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(MarkdownBlock.parse(content).enumerated()), id: \.offset) { _, block in
                            markdownBlock(block)
                        }
                    }
                    .textSelection(.enabled)
                case .failed(let message):
                    Label(message, systemImage: "doc.badge.ellipsis")
                        .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
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
                .padding(.top, level == 1 ? 4 : 8)
        case .bullet(let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                Text(inlineMarkdown(text))
            }
        case .numbered(let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "circle.fill").font(.system(size: 4)).foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                Text(inlineMarkdown(text))
            }
        case .quote(let text):
            Text(inlineMarkdown(text))
                .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                .padding(.leading, AppTheme.Spacing.md)
                .overlay(alignment: .leading) {
                    Rectangle().fill(AppTheme.palette(for: colorScheme).primary).frame(width: 2)
                }
        case .code(let text):
            ScrollView(.horizontal) {
                Text(text)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .padding(AppTheme.Spacing.sm)
            }
            .background(AppTheme.palette(for: colorScheme).surfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous))
        case .divider:
            Divider()
        case .spacing:
            Spacer().frame(height: 2)
        case .paragraph(let text):
            Text(inlineMarkdown(text)).font(.body).lineSpacing(3)
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

    private enum PreviewState {
        case loading
        case loaded(String)
        case failed(String)
    }
}
