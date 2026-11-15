import SwiftUI

struct RootView: View {
    @Environment(WorkspaceStore.self) private var store

    var body: some View {
        TabView {
            OverviewView()
                .tabItem { Label("Übersicht", systemImage: "square.grid.2x2") }

            PipelineView()
                .tabItem { Label("Pipeline", systemImage: "rectangle.stack") }

            ShootsView()
                .tabItem { Label("Drehplan", systemImage: "calendar") }

            ApprovalsView()
                .tabItem { Label("Freigaben", systemImage: "checkmark.seal") }
                .badge(store.pendingApprovalCount)

            SettingsView()
                .tabItem { Label("Mehr", systemImage: "ellipsis.circle") }
        }
        .alert(
            "Hinweis",
            isPresented: Binding(
                get: { store.lastError != nil },
                set: { if !$0 { store.lastError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { store.lastError = nil }
        } message: {
            Text(store.lastError ?? "")
        }
    }
}
