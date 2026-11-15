import SwiftUI

struct ShootsView: View {
    @Environment(WorkspaceStore.self) private var store
    @State private var showCreate = false
    @State private var showPast = false

    var body: some View {
        NavigationStack {
            List {
                Section("Anstehend") {
                    if store.upcomingShoots.isEmpty {
                        Text("Keine anstehenden Drehs.").foregroundStyle(.secondary)
                    }
                    ForEach(store.upcomingShoots) { shoot in
                        NavigationLink(value: shoot) { ShootRow(shoot: shoot) }
                    }
                }
                Section {
                    DisclosureGroup("Vergangen & abgesagt (\(store.pastShoots.count))", isExpanded: $showPast) {
                        ForEach(store.pastShoots) { shoot in
                            NavigationLink(value: shoot) { ShootRow(shoot: shoot) }
                        }
                    }
                }
            }
            .navigationTitle("Drehplan")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { ClientSwitcher() }
                if store.canEditProduction {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Label("Dreh planen", systemImage: "plus")
                        }
                        .disabled(store.visibleClients.isEmpty)
                    }
                }
            }
            .navigationDestination(for: Shoot.self) { shoot in
                ShootDetailView(shootId: shoot.id)
            }
            .sheet(isPresented: $showCreate) {
                ShootEditorView(
                    shoot: WorkspaceStore.newShootDraft(clientId: store.selectedClientId ?? store.visibleClients.first?.id ?? ""),
                    isNew: true
                )
            }
        }
    }
}

struct ShootRow: View {
    @Environment(WorkspaceStore.self) private var store
    let shoot: Shoot

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Text(dayNumber)
                    .font(.title2.weight(.bold))
                Text(monthShort)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 44)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(shoot.title)
                    .font(.subheadline.weight(.semibold))
                Text("\(DateUtils.displayDay(shoot.date)) · \(shoot.startTime)–\(shoot.endTime)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    ClientLabel(client: store.client(shoot.clientId))
                    Label(shoot.location.name, systemImage: "mappin")
                        .lineLimit(1)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                StatusBadge(text: shoot.status.label, tint: shoot.status.tint)
            }
        }
    }

    private var dayNumber: String {
        guard let date = DateUtils.date(fromDay: shoot.date) else { return "–" }
        return date.formatted(.dateTime.day())
    }

    private var monthShort: String {
        guard let date = DateUtils.date(fromDay: shoot.date) else { return "" }
        return date.formatted(.dateTime.month(.abbreviated).locale(Locale(identifier: "de_DE")))
    }
}

/// Call sheet of a shoot.
struct ShootDetailView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let shootId: String

    @State private var packed: Set<String> = []
    @State private var showEdit = false
    @State private var showOnSet = false
    @State private var confirmDelete = false

    var body: some View {
        if let shoot = store.shoot(shootId) {
            List {
                Section {
                    LabeledContent("Kunde") { ClientLabel(client: store.client(shoot.clientId)) }
                    LabeledContent("Datum", value: DateUtils.displayDay(shoot.date))
                    LabeledContent("Zeit", value: "\(shoot.startTime) – \(shoot.endTime)")
                    LabeledContent("Status") { StatusBadge(text: shoot.status.label, tint: shoot.status.tint) }
                }

                Section("Drehort") {
                    Text(shoot.location.name).font(.body.weight(.semibold))
                    if let address = shoot.location.address {
                        Text(address)
                        if let url = mapsURL(for: "\(shoot.location.name), \(address)") {
                            Link(destination: url) {
                                Label("In Karten öffnen", systemImage: "map")
                            }
                        }
                    }
                    if let notes = shoot.location.notes {
                        Text(notes).font(.footnote).foregroundStyle(.secondary)
                    }
                }

                if !shoot.schedule.isEmpty {
                    Section("Ablauf") {
                        ForEach(Array(shoot.schedule.enumerated()), id: \.offset) { _, entry in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(entry.time)
                                    .font(.subheadline.monospacedDigit().weight(.semibold))
                                    .frame(width: 52, alignment: .leading)
                                Text(entry.label)
                            }
                        }
                    }
                }

                Section("Team") {
                    if shoot.teamIds.isEmpty {
                        Text("Noch niemand eingeplant").foregroundStyle(.secondary)
                    }
                    ForEach(shoot.teamIds, id: \.self) { id in
                        HStack {
                            Avatar(member: store.member(id))
                            Text(store.member(id)?.name ?? id)
                            Spacer()
                            Text(store.member(id)?.role.label ?? "").foregroundStyle(.secondary)
                        }
                    }
                }

                if !shoot.equipment.isEmpty && store.canEditProduction {
                    Section {
                        ForEach(shoot.equipment, id: \.self) { item in
                            Button {
                                if packed.contains(item) { packed.remove(item) } else { packed.insert(item) }
                            } label: {
                                Label(item, systemImage: packed.contains(item) ? "checkmark.square.fill" : "square")
                                    .foregroundStyle(packed.contains(item) ? Color.secondary : Color.primary)
                            }
                        }
                    } header: {
                        Text("Equipment (\(packed.count)/\(shoot.equipment.count) gepackt)")
                    } footer: {
                        Text("Die Pack-Checkliste wird nur auf diesem Gerät und nur für diese Sitzung gemerkt.")
                    }
                }

                Section("Inhalte & Shotlisten") {
                    if shoot.contentIds.isEmpty {
                        Text("Keine Inhalte verknüpft").foregroundStyle(.secondary)
                    }
                    ForEach(shoot.contentIds, id: \.self) { contentId in
                        if let content = store.content(contentId) {
                            NavigationLink {
                                ContentDetailView(contentId: content.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(content.title).font(.subheadline.weight(.semibold))
                                    let shots = store.shots(for: content.id)
                                    Text("\(shots.filter(\.done).count)/\(shots.count) Shots · \(content.format.label)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if store.canEditProduction && !shoot.contentIds.isEmpty {
                        Button {
                            showOnSet = true
                        } label: {
                            Label("Am-Set-Modus für diesen Dreh", systemImage: "video.badge.checkmark")
                        }
                    }
                }

                if let notes = shoot.notes {
                    Section("Notizen") { Text(notes) }
                }

                if store.canEditProduction {
                    Section {
                        Button("Dreh löschen", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(shoot.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if store.canEditProduction {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Bearbeiten") { showEdit = true }
                    }
                }
            }
            .sheet(isPresented: $showEdit) {
                ShootEditorView(shoot: shoot, isNew: false)
            }
            .fullScreenCover(isPresented: $showOnSet) {
                OnSetModeView(contentIds: shoot.contentIds)
            }
            .confirmationDialog("Dreh „\(shoot.title)“ löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) {
                    if store.perform({ try store.deleteShoot(shoot.id) }) { dismiss() }
                }
            } message: {
                Text("Verknüpfte Inhalte bleiben erhalten, verlieren aber die Zuordnung.")
            }
        } else {
            EmptyStateView(title: "Dreh nicht gefunden", symbol: "calendar.badge.exclamationmark")
        }
    }

    private func mapsURL(for query: String) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        return components?.url
    }
}

struct ShootEditorView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let isNew: Bool
    @State private var draft: Shoot
    @State private var day: Date
    @State private var start: Date
    @State private var end: Date
    @State private var newEquipment = ""
    @State private var schedule: [EditableEntry]

    /// Call-sheet rows need stable identity while editing; the contract entry has none.
    struct EditableEntry: Identifiable {
        let id = UUID()
        var time: Date
        var label: String
    }

    init(shoot: Shoot, isNew: Bool) {
        self.isNew = isNew
        _draft = State(initialValue: shoot)
        let dayDate = DateUtils.date(fromDay: shoot.date) ?? Date()
        _day = State(initialValue: dayDate)
        _start = State(initialValue: DateUtils.date(fromTime: shoot.startTime, reference: dayDate) ?? dayDate)
        _end = State(initialValue: DateUtils.date(fromTime: shoot.endTime, reference: dayDate) ?? dayDate)
        _schedule = State(initialValue: shoot.schedule.map { entry in
            EditableEntry(time: DateUtils.date(fromTime: entry.time, reference: dayDate) ?? dayDate, label: entry.label)
        })
    }

    private var clientContents: [ContentItem] {
        store.data.contents.filter { $0.clientId == draft.clientId }.sorted { $0.title < $1.title }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Dreh") {
                    TextField("Titel", text: $draft.title)
                    Picker("Kunde", selection: $draft.clientId) {
                        ForEach(store.visibleClients) { Text($0.name).tag($0.id) }
                    }
                    .disabled(!isNew)
                    Picker("Status", selection: $draft.status) {
                        ForEach(ShootStatus.allCases) { Text($0.label).tag($0) }
                    }
                    DatePicker("Datum", selection: $day, displayedComponents: .date)
                    DatePicker("Beginn", selection: $start, displayedComponents: .hourAndMinute)
                    DatePicker("Ende", selection: $end, displayedComponents: .hourAndMinute)
                }

                Section("Drehort") {
                    TextField("Name", text: $draft.location.name)
                    TextField("Adresse", text: $draft.location.address.orEmpty)
                    TextField("Hinweise (Parken, Strom …)", text: $draft.location.notes.orEmpty, axis: .vertical)
                }

                Section("Ablauf") {
                    ForEach($schedule) { $entry in
                        HStack {
                            DatePicker("Zeit", selection: $entry.time, displayedComponents: .hourAndMinute)
                                .labelsHidden()
                            TextField("Programmpunkt", text: $entry.label)
                        }
                    }
                    .onDelete { schedule.remove(atOffsets: $0) }
                    Button {
                        let last = schedule.last?.time ?? start
                        schedule.append(EditableEntry(time: last, label: ""))
                    } label: {
                        Label("Programmpunkt hinzufügen", systemImage: "plus")
                    }
                }

                Section("Team") {
                    ForEach(store.agencyTeam) { member in
                        Toggle(member.name, isOn: Binding(
                            get: { draft.teamIds.contains(member.id) },
                            set: { isOn in
                                if isOn {
                                    if !draft.teamIds.contains(member.id) { draft.teamIds.append(member.id) }
                                } else {
                                    draft.teamIds.removeAll { $0 == member.id }
                                }
                            }
                        ))
                    }
                }

                Section {
                    ForEach(clientContents) { content in
                        Toggle(isOn: Binding(
                            get: { draft.contentIds.contains(content.id) },
                            set: { isOn in
                                if isOn {
                                    if !draft.contentIds.contains(content.id) { draft.contentIds.append(content.id) }
                                } else {
                                    draft.contentIds.removeAll { $0 == content.id }
                                }
                            }
                        )) {
                            VStack(alignment: .leading) {
                                Text(content.title)
                                if let other = content.shootId, other != draft.id, let otherShoot = store.shoot(other) {
                                    Text("Aktuell bei: \(otherShoot.title)")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                    if clientContents.isEmpty {
                        Text("Für diesen Kunden gibt es noch keinen Content.").foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Inhalte")
                } footer: {
                    Text("Ein Content kann genau einem Dreh zugeordnet sein.")
                }

                Section("Equipment") {
                    ForEach(draft.equipment.indices, id: \.self) { index in
                        Text(draft.equipment[index])
                    }
                    .onDelete { draft.equipment.remove(atOffsets: $0) }
                    HStack {
                        TextField("z. B. Gimbal", text: $newEquipment)
                            .onSubmit(addEquipment)
                        Button("Hinzufügen", action: addEquipment)
                            .disabled(newEquipment.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section("Notizen") {
                    TextField("Notizen", text: $draft.notes.orEmpty, axis: .vertical)
                        .lineLimit(2...6)
                }
            }
            .navigationTitle(isNew ? "Dreh planen" : "Dreh bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern", action: save)
                }
            }
            .onChange(of: draft.clientId) { _, _ in
                draft.contentIds.removeAll()
            }
        }
    }

    private func addEquipment() {
        let item = newEquipment.trimmingCharacters(in: .whitespaces)
        guard !item.isEmpty else { return }
        draft.equipment.append(item)
        newEquipment = ""
    }

    private func save() {
        var shoot = draft
        shoot.date = DateUtils.dayString(from: day)
        shoot.startTime = DateUtils.timeString(from: start)
        shoot.endTime = DateUtils.timeString(from: end)
        shoot.schedule = schedule.map { CallSheetEntry(time: DateUtils.timeString(from: $0.time), label: $0.label) }
        let ok = store.perform { _ = try store.saveShoot(shoot) }
        if ok { dismiss() }
    }
}
