import SwiftUI

struct AppSidebarView: View {
    @Binding var selection: AppDestination

    var body: some View {
        List(selection: $selection) {
            ForEach(AppDestination.allCases) { destination in
                self.destination(destination)
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("")
    }

    private func destination(_ destination: AppDestination) -> some View {
        Label(destination.title, systemImage: destination.systemImage)
            .tag(destination)
    }
}
