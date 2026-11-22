import SwiftUI

struct ContentDetailView: View {
    @Environment(WorkspaceStore.self) private var store
    let contentId: String

    enum Tab: String, CaseIterable, Identifiable {
        case overview, script, shots, media
        var id: String { rawValue }
        var label: String {
            L10n.t("ios.detail.tab.\(rawValue)")
        }
    }

    @State private var tab: Tab = .overview

    var body: some View {
        Group {
            if let content = store.content(contentId) {
                VStack(spacing: 0) {
                    Picker(L10n.t("ios.detail.section"), selection: $tab) {
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
                EmptyStateView(title: L10n.t("ios.content.notFound"), symbol: "questionmark.folder")
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
                LabeledContent(L10n.t("entity.client")) { ClientLabel(client: store.client(content.clientId)) }
                LabeledContent(L10n.t("ios.detail.stage")) { StageBadge(stage: content.stage) }
                LabeledContent(L10n.t("ios.form.format"), value: content.format.label)
                LabeledContent(L10n.t("ios.form.platforms"), value: content.platforms.map(\.label).joined(separator: ", "))
                if let pillar = content.pillar {
                    LabeledContent(L10n.t("ios.form.pillar"), value: pillar)
                }
                if let due = content.dueDate {
                    LabeledContent(L10n.t("ios.detail.due"), value: DateUtils.displayDay(due))
                }
                if let publishAt = content.publishAt {
                    LabeledContent(L10n.t("ios.detail.publishAt"), value: DateUtils.displayDateTime(publishAt))
                }
                if let shootId = content.shootId, let shoot = store.shoot(shootId) {
                    NavigationLink {
                        ShootDetailView(shootId: shoot.id)
                    } label: {
                        LabeledContent(L10n.t("entity.shoot"), value: "\(shoot.title) · \(DateUtils.displayDay(shoot.date))")
                    }
                }
            }

            if let brief = content.brief {
                Section(L10n.t("ios.form.brief")) {
                    Text(brief)
                }
            }

            Section(L10n.t("ios.common.team")) {
                if content.assigneeIds.isEmpty {
                    Text(L10n.t("ios.detail.noAssignees")).foregroundStyle(.secondary)
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
                Section(L10n.t("ios.tab.pipeline")) {
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
                        Label(L10n.t("ios.detail.changeStage"), systemImage: "arrow.left.arrow.right")
                    }
                    if content.stage != .published {
                        Button {
                            store.perform { try store.markPublished(contentId: content.id) }
                        } label: {
                            Label(L10n.t("ios.detail.markPublished"), systemImage: "checkmark.circle")
                        }
                    }
                }
            }

            Section(L10n.t("ios.detail.history")) {
                let entries = store.data.activity.filter { $0.targetType == .content && $0.targetId == content.id }
                if entries.isEmpty {
                    Text(L10n.t("ios.detail.noHistory")).foregroundStyle(.secondary)
                }
                ForEach(entries.prefix(10)) { entry in
                    ActivityRow(entry: entry)
                }
            }
        }
        .toolbar {
            if store.canEditProduction {
                ToolbarItem(placement: .primaryAction) {
                    Button(L10n.t("ios.common.edit")) { showEdit = true }
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
                Section(L10n.t("ios.form.basics")) {
                    TextField(L10n.t("field.title"), text: $draft.title)
                    Picker(L10n.t("ios.form.format"), selection: $draft.format) {
                        ForEach(ContentFormat.allCases) { Text($0.label).tag($0) }
                    }
                    let pillars = store.client(draft.clientId)?.pillars ?? []
                    if !pillars.isEmpty {
                        Picker(L10n.t("ios.form.pillar"), selection: Binding(
                            get: { draft.pillar ?? "" },
                            set: { draft.pillar = $0.isEmpty ? nil : $0 }
                        )) {
                            Text(L10n.t("ios.common.none")).tag("")
                            ForEach(pillars, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }
                Section(L10n.t("ios.form.platforms")) {
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
                Section(L10n.t("ios.form.dates")) {
                    Toggle(L10n.t("ios.form.hasDueDate"), isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker(L10n.t("ios.form.dueDate"), selection: $dueDate, displayedComponents: .date)
                    }
                    Toggle(L10n.t("ios.form.hasPublishAt"), isOn: $hasPublishAt)
                    if hasPublishAt {
                        DatePicker(L10n.t("ios.detail.publishAt"), selection: $publishAt)
                    }
                }
                Section(L10n.t("ios.form.brief")) {
                    TextField(L10n.t("ios.form.brief"), text: Binding(
                        get: { draft.brief ?? "" },
                        set: { draft.brief = $0 }
                    ), axis: .vertical)
                    .lineLimit(3...8)
                }
                Section(L10n.t("ios.form.assignees")) {
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
            .navigationTitle(L10n.t("ios.content.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("ios.common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.save"), action: save)
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
