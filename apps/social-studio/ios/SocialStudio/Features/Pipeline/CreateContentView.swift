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
                Section(L10n.t("ios.form.basics")) {
                    TextField(L10n.t("field.title"), text: $title)
                    Picker(L10n.t("entity.client"), selection: $clientId) {
                        ForEach(store.visibleClients) { client in
                            Text(client.name).tag(client.id)
                        }
                    }
                    Picker(L10n.t("ios.form.format"), selection: $format) {
                        ForEach(ContentFormat.allCases) { format in
                            Label(format.label, systemImage: format.symbol).tag(format)
                        }
                    }
                }

                Section(L10n.t("ios.form.platforms")) {
                    ForEach(Platform.allCases) { platform in
                        Toggle(platform.label, isOn: Binding(
                            get: { platforms.contains(platform) },
                            set: { isOn in
                                if isOn { platforms.insert(platform) } else { platforms.remove(platform) }
                            }
                        ))
                    }
                }

                Section(L10n.t("ios.form.planning")) {
                    let pillars = selectedClient?.pillars ?? []
                    if !pillars.isEmpty {
                        Picker(L10n.t("ios.form.pillar"), selection: $pillar) {
                            Text(L10n.t("ios.common.none")).tag("")
                            ForEach(pillars, id: \.self) { pillar in
                                Text(pillar).tag(pillar)
                            }
                        }
                    }
                    Toggle(L10n.t("ios.form.hasDueDate"), isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker(L10n.t("ios.form.dueDate"), selection: $dueDate, displayedComponents: .date)
                    }
                    TextField(L10n.t("ios.form.brief"), text: $brief, axis: .vertical)
                        .lineLimit(3...8)
                }

                Section(L10n.t("ios.form.assignees")) {
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
            .navigationTitle(L10n.t("ios.content.new"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("ios.common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.create"), action: create)
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
