import SwiftUI

struct TaskDetailView: View {
    let run: TaskRun

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(run.input).font(.title2.weight(.semibold)).textSelection(.enabled)
                LabeledContent("状态", value: run.status.rawValue)
                if run.status == .running { ProgressView().controlSize(.small) }
                if let response = run.response {
                    GroupBox("执行图") {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(response.graph.nodes) { node in
                                HStack { Image(systemName: node.status == "succeeded" ? "checkmark.circle.fill" : "circle").foregroundStyle(node.status == "succeeded" ? .green : .secondary); Text(node.stepID); Spacer(); Text(node.status).foregroundStyle(.secondary) }
                            }
                        }.padding(.vertical, 4)
                    }
                    GroupBox("交付证据") {
                        VStack(alignment: .leading, spacing: 8) {
                            LabeledContent("质量分", value: response.evaluation.score.formatted(.number.precision(.fractionLength(2))))
                            LabeledContent("Skill", value: "\(response.graph.skillID)@\(response.graph.skillVersion)")
                            LabeledContent("产物", value: response.artifactPath)
                        }.textSelection(.enabled)
                    }
                }
                if let error = run.error {
                    ContentUnavailableView("任务失败", systemImage: "exclamationmark.triangle", description: Text(error))
                }
            }.padding(24).frame(maxWidth: 760, alignment: .leading)
        }.navigationTitle("任务详情")
    }
}
