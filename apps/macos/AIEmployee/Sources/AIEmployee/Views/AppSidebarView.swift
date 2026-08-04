import SwiftUI

struct AppSidebarView: View {
    @Binding var selection: AppDestination

    var body: some View {
        List(selection: $selection) {
            Section("AI Company") {
                destination(.company)
            }
            Section("员工") {
                destination(.alex)
            }
            Section("工作") {
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
        .navigationTitle("AI Employee")
    }

    private func destination(_ destination: AppDestination) -> some View {
        Label(destination.title, systemImage: destination.systemImage)
            .tag(destination)
    }
}
