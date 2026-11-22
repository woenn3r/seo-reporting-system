import SwiftUI

@MainActor
struct OverviewView: View {
    @Environment(WorkspaceStore.self) private var store

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    greeting

                    section(L10n.t("ios.overview.stages")) {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(Stage.allCases) { stage in
                                StageCountCard(stage: stage, count: store.contents(in: stage).count)
                            }
                        }
                    }

                    section(L10n.t("ios.overview.openApprovals")) {
                        if store.pendingApprovalCount == 0 {
                            Text(L10n.t("ios.overview.noApprovals"))
                                .foregroundStyle(.secondary)
                        } else {
                            VStack(spacing: 8) {
                                // Scripts and cuts together, oldest first (DOMAIN_RULES: Freigaben-Eingang).
                                ForEach(store.approvalInbox) { item in
                                    switch item {
                                    case .script(let script):
                                        NavigationLink(value: ApprovalRoute.script(script.id)) {
                                            ApprovalRow(
                                                title: store.content(script.contentId)?.title ?? L10n.t("entity.script"),
                                                subtitle: L10n.t("ios.common.scriptVersion", ["version": String(script.version)]),
                                                symbol: "doc.text"
                                            )
                                        }
                                    case .media(let asset):
                                        NavigationLink(value: ApprovalRoute.media(asset.id)) {
                                            ApprovalRow(
                                                title: store.content(asset.contentId)?.title ?? L10n.t("ios.common.video"),
                                                subtitle: "\(asset.kind.label) v\(asset.version)" as String,
                                                symbol: "film"
                                            )
                                        }
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    section(L10n.t("ios.overview.nextShoots")) {
                        if store.upcomingShoots.isEmpty {
                            Text(L10n.t("ios.shoots.noneUpcoming"))
                                .foregroundStyle(.secondary)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(store.upcomingShoots.prefix(3)) { shoot in
                                    NavigationLink(value: shoot) {
                                        ShootRow(shoot: shoot)
                                            .padding(12)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    section(L10n.t("ios.overview.recentActivity")) {
                        let entries = Array(store.scopedActivity.prefix(8))
                        if entries.isEmpty {
                            Text(L10n.t("ios.overview.noActivity"))
                                .foregroundStyle(.secondary)
                        } else {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(entries) { entry in
                                    ActivityRow(entry: entry)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(L10n.t("ios.tab.overview"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { ClientSwitcher() }
            }
            .navigationDestination(for: ApprovalRoute.self) { route in
                route.destination
            }
            .navigationDestination(for: Shoot.self) { shoot in
                ShootDetailView(shootId: shoot.id)
            }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L10n.t("ios.overview.greeting", ["name": store.currentUser?.name.split(separator: " ").first.map(String.init) ?? ""]))
                .font(.title2.weight(.bold))
            Text(store.data.workspace.name)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            content()
        }
    }
}

@MainActor
private struct StageCountCard: View {
    let stage: Stage
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: stage.symbol)
                .foregroundStyle(stage.tint)
                .accessibilityHidden(true)
            Text("\(count)")
                .font(.title.weight(.bold))
            Text(stage.label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

@MainActor
struct ApprovalRow: View {
    let title: String
    let subtitle: String
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(.orange)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .contentShape(Rectangle())
    }
}

@MainActor
struct ActivityRow: View {
    @Environment(WorkspaceStore.self) private var store
    let entry: Activity

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Avatar(member: store.member(entry.actorId), size: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: "\(store.member(entry.actorId)?.name ?? L10n.t("ios.common.someone")) \(entry.displayText)")
                    .font(.subheadline)
                Text(DateUtils.relative(entry.at))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Navigation targets for the approval inbox.
enum ApprovalRoute: Hashable {
    case script(String)
    case media(String)

    @MainActor @ViewBuilder
    var destination: some View {
        switch self {
        case .script(let id): ScriptReviewView(scriptId: id)
        case .media(let id): VideoReviewView(mediaId: id)
        }
    }
}
