import SwiftUI

struct RootView: View {
    @Environment(WorkspaceStore.self) private var store

    enum Tab: Hashable { case overview, pipeline, shoots, approvals, more }

    /// Kept outside the TabView so the selected tab survives a language switch.
    @State private var selectedTab: Tab = .overview

    var body: some View {
        // Reading the language here registers an observation dependency: switching the language
        // re-renders the whole tree. `.id` additionally rebuilds views that cached strings in @State.
        let language = L10n.shared.language

        TabView(selection: $selectedTab) {
            OverviewView()
                .tabItem { Label(L10n.t("ios.tab.overview"), systemImage: "square.grid.2x2") }
                .tag(Tab.overview)

            PipelineView()
                .tabItem { Label(L10n.t("ios.tab.pipeline"), systemImage: "rectangle.stack") }
                .tag(Tab.pipeline)

            ShootsView()
                .tabItem { Label(L10n.t("ios.tab.shoots"), systemImage: "calendar") }
                .tag(Tab.shoots)

            ApprovalsView()
                .tabItem { Label(L10n.t("ios.tab.approvals"), systemImage: "checkmark.seal") }
                .badge(store.pendingApprovalCount)
                .tag(Tab.approvals)

            SettingsView()
                .tabItem { Label(L10n.t("ios.tab.more"), systemImage: "ellipsis.circle") }
                .tag(Tab.more)
        }
        .id(language)
        .environment(\.locale, language.locale)
        .alert(
            L10n.t("ios.alert.title"),
            isPresented: Binding(
                get: { store.lastError != nil },
                set: { if !$0 { store.lastError = nil } }
            )
        ) {
            Button(L10n.t("ios.common.ok"), role: .cancel) { store.lastError = nil }
        } message: {
            Text(store.lastError ?? "")
        }
    }
}
