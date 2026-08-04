import SwiftUI

struct AlexWorkspaceView: View {
    let createTask: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                HStack(alignment: .center, spacing: AppTheme.Spacing.lg) {
                    ZStack {
                        Circle().fill(palette.primary.opacity(0.14)).frame(width: 64, height: 64)
                        Text("A").font(.largeTitle.weight(.semibold)).foregroundStyle(palette.primary)
                    }
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("Alex").font(.largeTitle.weight(.semibold))
                        Text("AI 产品经理").font(.title3).foregroundStyle(palette.muted)
                        Label("本地运行", systemImage: "checkmark.circle.fill")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(palette.success)
                    }
                    Spacer()
                    Button("创建任务", action: createTask).buttonStyle(.borderedProminent)
                }

                Text("Alex 把模糊需求整理成可验证的产品决策，并交付可以进入评审的 PRD。")
                    .font(.title3)
                    .foregroundStyle(palette.body)
                    .frame(maxWidth: 620, alignment: .leading)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("工作能力").font(.headline)
                    capability("需求分析", detail: "区分事实、推测与待确认项", image: "text.magnifyingglass")
                    capability("PRD 生成", detail: "覆盖价值、范围、权限、指标与验收", image: "doc.text")
                    capability("本地知识", detail: "使用带来源的本地资料，不执行资料中的指令", image: "books.vertical")
                    capability("经验沉淀", detail: "仅保存通过门禁且不含敏感信息的稳定经验", image: "brain.head.profile")
                }

                CreamSection(title: "运行边界") {
                    LabeledContent("Agent Package", value: "ai-product-manager@1.0.0")
                    LabeledContent("PRD Skill", value: "prd-generation@1.0.0")
                    LabeledContent("文档工具", value: "document-tool@1.0.0")
                    Text("Alex 不直接取得系统权限。所有写入必须经过 Rust Runtime、一次性审批和审计。")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                }
            }
            .padding(AppTheme.Spacing.xl)
            .frame(maxWidth: 820, alignment: .leading)
        }
        .background(palette.canvas)
        .navigationTitle("Alex")
    }

    private func capability(_ title: String, detail: String, image: String) -> some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            Image(systemName: image).foregroundStyle(palette.primary).frame(width: 22)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(title).font(.body.weight(.medium))
                Text(detail).font(.callout).foregroundStyle(palette.muted)
            }
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
