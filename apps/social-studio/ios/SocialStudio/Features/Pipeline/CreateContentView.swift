import SwiftUI

struct CreateContentView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var clientId = ""
    @State private var format: ContentFormat = .reel
    @State private var platforms: Set<Platform> = [.instagram]
    @State private var pillar = ""
    @State private var brief = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date()
    @State private var assigneeIds: Set<String> = []

    private var selectedClient: Client? { store.client(clientId) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Basis") {
                    TextField("Titel", text: $title)
                    Picker("Kunde", selection: $clientId) {
                        ForEach(store.visibleClients) { client in
                            Text(client.name).tag(client.id)
                        }
                    }
                    Picker("Format", selection: $format) {
                        ForEach(ContentFormat.allCases) { format in
                            Label(format.label, systemImage: format.symbol).tag(format)
                        }
                    }
                }

                Section("Plattformen") {
                    ForEach(Platform.allCases) { platform in
                        Toggle(platform.label, isOn: Binding(
                            get: { platforms.contains(platform) },
                            set: { isOn in
                                if isOn { platforms.insert(platform) } else { platforms.remove(platform) }
                            }
                        ))
                    }
                }

                Section("Planung") {
                    let pillars = selectedClient?.pillars ?? []
                    if !pillars.isEmpty {
                        Picker("Content-Säule", selection: $pillar) {
                            Text("Keine").tag("")
                            ForEach(pillars, id: \.self) { pillar in
                                Text(pillar).tag(pillar)
                            }
                        }
                    }
                    Toggle("Fälligkeitsdatum", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Fällig am", selection: $dueDate, displayedComponents: .date)
                    }
                    TextField("Briefing", text: $brief, axis: .vertical)
                        .lineLimit(3...8)
                }

                Section("Zuständig") {
                    ForEach(store.agencyTeam) { member in
                        Toggle(isOn: Binding(
                            get: { assigneeIds.contains(member.id) },
                            set: { isOn in
                                if isOn { assigneeIds.insert(member.id) } else { assigneeIds.remove(member.id) }
                            }
                        )) {
                            HStack {
                                Avatar(member: member, size: 24)
                                Text(member.name)
                                Text(member.role.label).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Neuer Content")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anlegen", action: create)
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || platforms.isEmpty || clientId.isEmpty)
                }
            }
            .onAppear {
                if clientId.isEmpty {
                    clientId = store.selectedClientId ?? store.visibleClients.first?.id ?? ""
                }
            }
            .onChange(of: clientId) { _, _ in
                pillar = ""
            }
        }
    }

    private func create() {
        let ok = store.perform {
            _ = try store.createContent(
                clientId: clientId,
                title: title,
                format: format,
                platforms: Platform.allCases.filter { platforms.contains($0) },
                pillar: pillar,
                brief: brief,
                dueDate: hasDueDate ? DateUtils.dayString(from: dueDate) : nil,
                assigneeIds: Array(assigneeIds)
            )
        }
        if ok { dismiss() }
    }
}
