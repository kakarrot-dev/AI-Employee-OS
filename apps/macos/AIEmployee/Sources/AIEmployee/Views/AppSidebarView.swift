import SwiftUI

struct AppSidebarView: View {
    @Binding var selection: AppDestination

    var body: some View {
        List(selection: $selection) {
            Section("工作空间") {
                destination(.company)
                destination(.alex)
            }
            Section("资料") {
                destination(.tasks)
                destination(.artifacts)
                destination(.knowledge)
            }
            Section {
                SettingsLink {
                    Label("设置", systemImage: "gearshape")
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Alex Office")
    }

    private func destination(_ destination: AppDestination) -> some View {
        Label(destination.title, systemImage: destination.systemImage)
            .tag(destination)
    }
}
