import SwiftUI

/// Inbox of everything waiting for approval (DOMAIN_RULES: Freigaben-Eingang).
@MainActor
struct ApprovalsView: View {
    @Environment(WorkspaceStore.self) private var store

    var body: some View {
        NavigationStack {
            List {
                if store.pendingApprovalCount == 0 {
                    EmptyStateView(
                        title: L10n.t("ios.approvals.emptyTitle"),
                        symbol: "checkmark.seal",
                        message: L10n.t("ios.approvals.emptyMessage")
                    )
                    .listRowBackground(Color.clear)
                }

                if !store.pendingScriptApprovals.isEmpty {
                    Section(L10n.t("ios.approvals.scripts")) {
                        ForEach(store.pendingScriptApprovals) { script in
                            NavigationLink(value: ApprovalRoute.script(script.id)) {
                                approvalLabel(
                                    contentId: script.contentId,
                                    detail: L10n.t("ios.common.scriptVersion", ["version": String(script.version)]) + " · " + DateUtils.relative(script.updatedAt),
                                    symbol: "doc.text"
                                )
                            }
                        }
                    }
                }

                if !store.pendingMediaApprovals.isEmpty {
                    Section(L10n.t("ios.approvals.cuts")) {
                        ForEach(store.pendingMediaApprovals) { asset in
                            NavigationLink(value: ApprovalRoute.media(asset.id)) {
                                approvalLabel(
                                    contentId: asset.contentId,
                                    detail: "\(asset.kind.label) v\(asset.version) · " + L10n.tp("ios.common.openComments", count: asset.comments.filter { !$0.resolved }.count),
                                    symbol: "film"
                                )
                            }
                        }
                    }
                }
            }
            .navigationTitle(L10n.t("ios.tab.approvals"))
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
                Text(content?.title ?? L10n.t("entity.content"))
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
