import SwiftUI

struct ContentDetailView: View {
    @Environment(WorkspaceStore.self) private var store
    let contentId: String

    enum Tab: String, CaseIterable, Identifiable {
        case overview, script, shots, media
        var id: String { rawValue }
        var label: String {
            switch self {
            case .overview: return "Überblick"
            case .script: return "Skript"
            case .shots: return "Shots"
            case .media: return "Medien"
            }
        }
    }

    @State private var tab: Tab = .overview

    var body: some View {
        Group {
            if let content = store.content(contentId) {
                VStack(spacing: 0) {
                    Picker("Bereich", selection: $tab) {
                        ForEach(Tab.allCases) { tab in
                            Text(tab.label).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding([.horizontal, .top])
                    .padding(.bottom, 8)

                    switch tab {
                    case .overview: ContentOverviewTab(content: content)
                    case .script: ScriptTab(content: content)
                    case .shots: ShotListView(content: content)
                    case .media: MediaListView(content: content)
                    }
                }
                .navigationTitle(content.title)
                .navigationBarTitleDisplayMode(.inline)
            } else {
                EmptyStateView(title: "Content nicht gefunden", symbol: "questionmark.folder")
            }
        }
    }
}

private struct ContentOverviewTab: View {
    @Environment(WorkspaceStore.self) private var store
    let content: ContentItem
    @State private var showEdit = false

    var body: some View {
        List {
            Section {
                LabeledContent("Kunde") { ClientLabel(client: store.client(content.clientId)) }
                LabeledContent("Stufe") { StageBadge(stage: content.stage) }
                LabeledContent("Format", value: content.format.label)
                LabeledContent("Plattformen", value: content.platforms.map(\.label).joined(separator: ", "))
                if let pillar = content.pillar {
                    LabeledContent("Content-Säule", value: pillar)
                }
                if let due = content.dueDate {
                    LabeledContent("Fällig", value: DateUtils.displayDay(due))
                }
                if let publishAt = content.publishAt {
                    LabeledContent("Veröffentlichung", value: DateUtils.displayDateTime(publishAt))
                }
                if let shootId = content.shootId, let shoot = store.shoot(shootId) {
                    NavigationLink {
                        ShootDetailView(shootId: shoot.id)
                    } label: {
                        LabeledContent("Dreh", value: "\(shoot.title) · \(DateUtils.displayDay(shoot.date))")
                    }
                }
            }

            if let brief = content.brief {
                Section("Briefing") {
                    Text(brief)
                }
            }

            Section("Team") {
                if content.assigneeIds.isEmpty {
                    Text("Niemand zugewiesen").foregroundStyle(.secondary)
                }
                ForEach(content.assigneeIds, id: \.self) { id in
                    HStack {
                        Avatar(member: store.member(id))
                        Text(store.member(id)?.name ?? id)
                        Spacer()
                        Text(store.member(id)?.role.label ?? "").foregroundStyle(.secondary)
                    }
                }
            }

            if store.canEditProduction {
                Section("Pipeline") {
                    Menu {
                        ForEach(Stage.allCases) { stage in
                            Button {
                                store.perform { try store.moveStage(contentId: content.id, to: stage) }
                            } label: {
                                Label(stage.label, systemImage: stage.symbol)
                            }
                            .disabled(stage == content.stage)
                        }
                    } label: {
                        Label("Stufe manuell ändern", systemImage: "arrow.left.arrow.right")
                    }
                    if content.stage != .published {
                        Button {
                            store.perform { try store.markPublished(contentId: content.id) }
                        } label: {
                            Label("Als veröffentlicht markieren", systemImage: "checkmark.circle")
                        }
                    }
                }
            }

            Section("Verlauf") {
                let entries = store.data.activity.filter { $0.targetType == .content && $0.targetId == content.id }
                if entries.isEmpty {
                    Text("Noch keine Einträge.").foregroundStyle(.secondary)
                }
                ForEach(entries.prefix(10)) { entry in
                    ActivityRow(entry: entry)
                }
            }
        }
        .toolbar {
            if store.canEditProduction {
                ToolbarItem(placement: .primaryAction) {
                    Button("Bearbeiten") { showEdit = true }
                }
            }
        }
        .sheet(isPresented: $showEdit) {
            EditContentView(content: content)
        }
    }
}

private struct EditContentView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: ContentItem
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var hasPublishAt: Bool
    @State private var publishAt: Date

    init(content: ContentItem) {
        _draft = State(initialValue: content)
        _hasDueDate = State(initialValue: content.dueDate != nil)
        _dueDate = State(initialValue: content.dueDate.flatMap(DateUtils.date(fromDay:)) ?? Date())
        _hasPublishAt = State(initialValue: content.publishAt != nil)
        _publishAt = State(initialValue: content.publishAt ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Basis") {
                    TextField("Titel", text: $draft.title)
                    Picker("Format", selection: $draft.format) {
                        ForEach(ContentFormat.allCases) { Text($0.label).tag($0) }
                    }
                    let pillars = store.client(draft.clientId)?.pillars ?? []
                    if !pillars.isEmpty {
                        Picker("Content-Säule", selection: Binding(
                            get: { draft.pillar ?? "" },
                            set: { draft.pillar = $0.isEmpty ? nil : $0 }
                        )) {
                            Text("Keine").tag("")
                            ForEach(pillars, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }
                Section("Plattformen") {
                    ForEach(Platform.allCases) { platform in
                        Toggle(platform.label, isOn: Binding(
                            get: { draft.platforms.contains(platform) },
                            set: { isOn in
                                if isOn {
                                    if !draft.platforms.contains(platform) { draft.platforms.append(platform) }
                                } else {
                                    draft.platforms.removeAll { $0 == platform }
                                }
                            }
                        ))
                    }
                }
                Section("Termine") {
                    Toggle("Fälligkeitsdatum", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Fällig am", selection: $dueDate, displayedComponents: .date)
                    }
                    Toggle("Veröffentlichung geplant", isOn: $hasPublishAt)
                    if hasPublishAt {
                        DatePicker("Veröffentlichung", selection: $publishAt)
                    }
                }
                Section("Briefing") {
                    TextField("Briefing", text: Binding(
                        get: { draft.brief ?? "" },
                        set: { draft.brief = $0 }
                    ), axis: .vertical)
                    .lineLimit(3...8)
                }
                Section("Zuständig") {
                    ForEach(store.agencyTeam) { member in
                        Toggle(member.name, isOn: Binding(
                            get: { draft.assigneeIds.contains(member.id) },
                            set: { isOn in
                                if isOn {
                                    if !draft.assigneeIds.contains(member.id) { draft.assigneeIds.append(member.id) }
                                } else {
                                    draft.assigneeIds.removeAll { $0 == member.id }
                                }
                            }
                        ))
                    }
                }
            }
            .navigationTitle("Content bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern", action: save)
                        .disabled(draft.platforms.isEmpty || draft.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        var updated = draft
        updated.title = updated.title.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.brief = updated.brief.nilIfBlank
        updated.dueDate = hasDueDate ? DateUtils.dayString(from: dueDate) : nil
        updated.publishAt = hasPublishAt ? publishAt : nil
        if store.perform({ try store.updateContent(updated) }) {
            dismiss()
        }
    }
}
