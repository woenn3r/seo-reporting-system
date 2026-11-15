import SwiftUI

/// Inbox of everything waiting for approval (DOMAIN_RULES: Freigaben-Eingang).
struct ApprovalsView: View {
    @Environment(WorkspaceStore.self) private var store

    var body: some View {
        NavigationStack {
            List {
                if store.pendingApprovalCount == 0 {
                    EmptyStateView(
                        title: "Alles freigegeben",
                        symbol: "checkmark.seal",
                        message: "Sobald Skripte oder Schnitte eingereicht werden, erscheinen sie hier."
                    )
                    .listRowBackground(Color.clear)
                }

                if !store.pendingScriptApprovals.isEmpty {
                    Section("Skripte") {
                        ForEach(store.pendingScriptApprovals) { script in
                            NavigationLink(value: ApprovalRoute.script(script.id)) {
                                approvalLabel(
                                    contentId: script.contentId,
                                    detail: "Skript v\(script.version) · \(DateUtils.relative(script.updatedAt))",
                                    symbol: "doc.text"
                                )
                            }
                        }
                    }
                }

                if !store.pendingMediaApprovals.isEmpty {
                    Section("Schnitte") {
                        ForEach(store.pendingMediaApprovals) { asset in
                            NavigationLink(value: ApprovalRoute.media(asset.id)) {
                                approvalLabel(
                                    contentId: asset.contentId,
                                    detail: "\(asset.kind.label) v\(asset.version) · \(asset.comments.filter { !$0.resolved }.count) offene Kommentare",
                                    symbol: "film"
                                )
                            }
                        }
                    }
                }
            }
            .navigationTitle("Freigaben")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { ClientSwitcher() }
            }
            .navigationDestination(for: ApprovalRoute.self) { route in
                route.destination
            }
        }
    }

    private func approvalLabel(contentId: String, detail: String, symbol: String) -> some View {
        let content = store.content(contentId)
        return HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(.orange)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(content?.title ?? "Content")
                    .font(.subheadline.weight(.semibold))
                ClientLabel(client: content.flatMap { store.client($0.clientId) })
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
