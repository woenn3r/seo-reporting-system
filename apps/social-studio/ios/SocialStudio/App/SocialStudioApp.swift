import SwiftUI

@main
struct SocialStudioApp: App {
    @State private var store: WorkspaceStore

    init() {
        _store = State(initialValue: WorkspaceStore.live())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(\.locale, Locale(identifier: "de_DE"))
        }
    }
}
