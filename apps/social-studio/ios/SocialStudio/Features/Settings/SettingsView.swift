import SwiftUI

struct SettingsView: View {
    @Environment(WorkspaceStore.self) private var store
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker(L10n.t("ios.settings.language"), selection: Binding(
                        get: { L10n.shared.language },
                        set: { L10n.shared.setLanguage($0) }
                    )) {
                        ForEach(AppLanguage.allCases) { language in
                            Text(verbatim: language.nativeName).tag(language)
                        }
                    }
                } footer: {
                    Text(L10n.t("ios.settings.languageFooter"))
                }

                Section {
                    Picker(L10n.t("ios.settings.signedInAs"), selection: Binding(
                        get: { store.data.workspace.currentUserId },
                        set: { store.setCurrentUser($0) }
                    )) {
                        ForEach(store.data.team) { member in
                            Text(verbatim: "\(member.name) (\(member.role.label))").tag(member.id)
                        }
                    }
                } header: {
                    Text(L10n.t("ios.settings.user"))
                } footer: {
                    Text(L10n.t("ios.settings.userFooter"))
                }

                Section(L10n.t("ios.settings.clients")) {
                    ForEach(store.visibleClients) { client in
                        NavigationLink {
                            ClientDetailView(clientId: client.id)
                        } label: {
                            HStack {
                                ClientLabel(client: client)
                                Spacer()
                                Text(L10n.tp("ios.settings.contentCount", count: store.data.contents.filter { $0.clientId == client.id }.count))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if store.canEditProduction {
                    Section(L10n.t("ios.common.team")) {
                        ForEach(store.agencyTeam) { member in
                            HStack {
                                Avatar(member: member)
                                VStack(alignment: .leading) {
                                    Text(member.name)
                                    Text(member.role.label).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section {
                    Button(L10n.t("ios.settings.resetDemo"), role: .destructive) { confirmReset = true }
                } footer: {
                    Text(L10n.t("ios.settings.localFooter", ["workspace": store.data.workspace.name]))
                }
            }
            .navigationTitle(L10n.t("ios.tab.more"))
            .confirmationDialog(L10n.t("ios.settings.resetConfirm"), isPresented: $confirmReset, titleVisibility: .visible) {
                Button(L10n.t("ios.settings.reset"), role: .destructive) {
                    store.perform { try store.resetDemoData() }
                }
            }
        }
    }
}

struct ClientDetailView: View {
    @Environment(WorkspaceStore.self) private var store
    let clientId: String

    var body: some View {
        if let client = store.client(clientId) {
            List {
                Section {
                    if let industry = client.industry { LabeledContent(L10n.t("ios.client.industry"), value: industry) }
                    if let contact = client.contactName { LabeledContent(L10n.t("ios.client.contact"), value: contact) }
                    if let email = client.contactEmail, let url = URL(string: "mailto:\(email)") {
                        Link(destination: url) { Label(email, systemImage: "envelope") }
                    }
                    LabeledContent(L10n.t("ios.common.status"), value: client.active ? L10n.t("ios.client.active") : L10n.t("ios.client.inactive"))
                }

                if let handles = client.handles {
                    let platforms = Platform.allCases.filter { handles.handle(for: $0) != nil }
                    if !platforms.isEmpty {
                        Section(L10n.t("ios.client.channels")) {
                            ForEach(platforms) { platform in
                                LabeledContent(platform.label, value: handles.handle(for: platform) ?? "")
                            }
                        }
                    }
                }

                if let pillars = client.pillars, !pillars.isEmpty {
                    Section(L10n.t("ios.client.pillars")) {
                        ForEach(pillars, id: \.self) { Text($0) }
                    }
                }

                if store.canSeeInternalNotes, let notes = client.brandNotes {
                    Section(L10n.t("ios.client.brandNotes")) { Text(notes) }
                }

                Section(L10n.t("ios.common.contents")) {
                    let items = store.data.contents.filter { $0.clientId == client.id }
                    ForEach(items) { item in
                        NavigationLink {
                            ContentDetailView(contentId: item.id)
                        } label: {
                            ContentRow(content: item)
                        }
                    }
                }
            }
            .navigationTitle(client.name)
        } else {
            EmptyStateView(title: L10n.t("ios.client.notFound"), symbol: "person.crop.circle.badge.questionmark")
        }
    }
}
