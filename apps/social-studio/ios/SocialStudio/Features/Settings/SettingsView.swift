import SwiftUI

struct SettingsView: View {
    @Environment(WorkspaceStore.self) private var store
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Angemeldet als", selection: Binding(
                        get: { store.data.workspace.currentUserId },
                        set: { store.setCurrentUser($0) }
                    )) {
                        ForEach(store.data.team) { member in
                            Text("\(member.name) (\(member.role.label))").tag(member.id)
                        }
                    }
                } header: {
                    Text("Nutzer")
                } footer: {
                    Text("Demo-Umschaltung ohne Login. Kunden sehen nur ihre eigenen Inhalte, kein Rohmaterial und keine internen Notizen.")
                }

                Section("Kunden") {
                    ForEach(store.visibleClients) { client in
                        NavigationLink {
                            ClientDetailView(clientId: client.id)
                        } label: {
                            HStack {
                                ClientLabel(client: client)
                                Spacer()
                                Text("\(store.data.contents.filter { $0.clientId == client.id }.count) Inhalte")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if store.canEditProduction {
                    Section("Team") {
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
                    Button("Demo-Daten zurücksetzen", role: .destructive) { confirmReset = true }
                } footer: {
                    Text("Daten liegen nur lokal auf diesem Gerät (\(store.data.workspace.name)). Synchronisation mit der Web-App erfordert ein Backend.")
                }
            }
            .navigationTitle("Mehr")
            .confirmationDialog("Alle lokalen Änderungen und hochgeladenen Videos löschen?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Zurücksetzen", role: .destructive) {
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
                    if let industry = client.industry { LabeledContent("Branche", value: industry) }
                    if let contact = client.contactName { LabeledContent("Ansprechpartner:in", value: contact) }
                    if let email = client.contactEmail, let url = URL(string: "mailto:\(email)") {
                        Link(destination: url) { Label(email, systemImage: "envelope") }
                    }
                    LabeledContent("Status", value: client.active ? "Aktiv" : "Inaktiv")
                }

                if let handles = client.handles {
                    let platforms = Platform.allCases.filter { handles.handle(for: $0) != nil }
                    if !platforms.isEmpty {
                        Section("Kanäle") {
                            ForEach(platforms) { platform in
                                LabeledContent(platform.label, value: handles.handle(for: platform) ?? "")
                            }
                        }
                    }
                }

                if let pillars = client.pillars, !pillars.isEmpty {
                    Section("Content-Säulen") {
                        ForEach(pillars, id: \.self) { Text($0) }
                    }
                }

                if store.canSeeInternalNotes, let notes = client.brandNotes {
                    Section("Brand-Notizen (intern)") { Text(notes) }
                }

                Section("Inhalte") {
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
            EmptyStateView(title: "Kunde nicht gefunden", symbol: "person.crop.circle.badge.questionmark")
        }
    }
}
