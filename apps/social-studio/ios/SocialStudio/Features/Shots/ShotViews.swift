import SwiftUI
import UIKit

/// Shot list ("Perspektiven") for a content: plan framing / angle / movement per shot.
struct ShotListView: View {
    @Environment(WorkspaceStore.self) private var store
    let content: ContentItem

    @State private var editing: Shot?
    @State private var isCreating = false
    @State private var showOnSet = false

    private var shots: [Shot] { store.shots(for: content.id) }
    private var doneCount: Int { shots.filter(\.done).count }

    var body: some View {
        List {
            if !shots.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(value: Double(doneCount), total: Double(max(shots.count, 1)))
                        Text(L10n.t("ios.shots.progress", ["done": String(doneCount), "total": String(shots.count)]))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if store.canEditProduction {
                        Button {
                            showOnSet = true
                        } label: {
                            Label(L10n.t("ios.shots.startOnSet"), systemImage: "video.badge.checkmark")
                        }
                    }
                }
            }

            Section {
                ForEach(shots) { shot in
                    Button {
                        if store.canEditProduction { editing = shot }
                    } label: {
                        ShotRow(shot: shot, sceneTitle: sceneTitle(for: shot), showNotes: store.canSeeInternalNotes)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .leading) {
                        if store.canEditProduction {
                            Button {
                                store.toggleShotDone(shot.id)
                            } label: {
                                Label(shot.done ? L10n.t("ios.common.open") : L10n.t("ios.common.done"), systemImage: shot.done ? "arrow.uturn.backward" : "checkmark")
                            }
                            .tint(.green)
                        }
                    }
                }
                .onDelete { offsets in
                    store.deleteShots(contentId: content.id, at: offsets)
                }
                .onMove { source, destination in
                    store.moveShots(contentId: content.id, from: source, to: destination)
                }
                .deleteDisabled(!store.canEditProduction)
                .moveDisabled(!store.canEditProduction)

                if shots.isEmpty {
                    Text(L10n.t("ios.shots.none"))
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text(L10n.t("ios.shots.title"))
            } footer: {
                if store.canEditProduction && !shots.isEmpty {
                    Text(L10n.t("ios.shots.hint"))
                }
            }
        }
        .toolbar {
            if store.canEditProduction {
                ToolbarItemGroup(placement: .primaryAction) {
                    if !shots.isEmpty { EditButton() }
                    Button {
                        isCreating = true
                    } label: {
                        Label(L10n.t("ios.shots.add"), systemImage: "plus")
                    }
                }
            }
        }
        .sheet(item: $editing) { shot in
            ShotEditorView(contentId: content.id, shot: shot, isNew: false)
        }
        .sheet(isPresented: $isCreating) {
            ShotEditorView(contentId: content.id, shot: Self.blankShot(contentId: content.id), isNew: true)
        }
        .fullScreenCover(isPresented: $showOnSet) {
            OnSetModeView(contentIds: [content.id])
        }
    }

    private func sceneTitle(for shot: Shot) -> String? {
        guard let sceneId = shot.sceneId else { return nil }
        return store.currentScript(for: content.id)?.scenes.first { $0.id == sceneId }?.title
    }

    static func blankShot(contentId: String) -> Shot {
        Shot(
            id: "new",
            contentId: contentId,
            sceneId: nil,
            order: 0,
            description: "",
            framing: .medium,
            angle: .eyeLevel,
            movement: .staticShot,
            aspectRatio: .portrait,
            lens: nil,
            notes: nil,
            done: false
        )
    }
}

struct ShotRow: View {
    let shot: Shot
    var sceneTitle: String?
    var showNotes: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: shot.done ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(shot.done ? Color.green : Color.secondary)
                .font(.title3)
                .accessibilityLabel(shot.done ? L10n.t("ios.common.done") : L10n.t("ios.common.open"))
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: "\(shot.order + 1). \(shot.description)")
                    .font(.subheadline.weight(.semibold))
                    .strikethrough(shot.done)
                FlowLayout(spacing: 6) {
                    TagView(text: shot.framing.label, symbol: "viewfinder")
                    TagView(text: shot.angle.label, symbol: "camera.viewfinder")
                    TagView(text: shot.movement.label, symbol: "arrow.up.and.down.and.arrow.left.and.right")
                    TagView(text: shot.aspectRatio.label, symbol: "aspectratio")
                    if let lens = shot.lens, !lens.isEmpty {
                        TagView(text: lens, symbol: "camera.aperture")
                    }
                }
                if let sceneTitle {
                    Text(L10n.t("ios.shots.sceneRef", ["scene": sceneTitle]))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if showNotes, let notes = shot.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

struct TagView: View {
    let text: String
    let symbol: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 6))
    }
}

struct ShotEditorView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let contentId: String
    let isNew: Bool
    @State private var draft: Shot

    init(contentId: String, shot: Shot, isNew: Bool) {
        self.contentId = contentId
        self.isNew = isNew
        _draft = State(initialValue: shot)
    }

    private var scenes: [ScriptScene] { store.currentScript(for: contentId)?.scenes ?? [] }

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.t("entity.shot")) {
                    TextField(L10n.t("ios.shots.descPlaceholder"), text: $draft.description, axis: .vertical)
                        .lineLimit(1...4)
                    if !scenes.isEmpty {
                        Picker(L10n.t("ios.script.scene"), selection: $draft.sceneId) {
                            Text(L10n.t("ios.common.none")).tag(String?.none)
                            ForEach(scenes) { scene in
                                Text(scene.title).tag(Optional(scene.id))
                            }
                        }
                    }
                }
                Section(L10n.t("ios.shots.perspective")) {
                    Picker(L10n.t("ios.shots.framing"), selection: $draft.framing) {
                        ForEach(Framing.allCases) { Text($0.label).tag($0) }
                    }
                    Picker(L10n.t("ios.shots.angle"), selection: $draft.angle) {
                        ForEach(CameraAngle.allCases) { Text($0.label).tag($0) }
                    }
                    Picker(L10n.t("ios.shots.movement"), selection: $draft.movement) {
                        ForEach(CameraMovement.allCases) { Text($0.label).tag($0) }
                    }
                    Picker(L10n.t("ios.form.format"), selection: $draft.aspectRatio) {
                        ForEach(AspectRatio.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    TextField(L10n.t("ios.shots.lensPlaceholder"), text: $draft.lens.orEmpty)
                }
                Section(L10n.t("ios.shots.notesInternal")) {
                    TextField(L10n.t("ios.shots.notesPlaceholder"), text: $draft.notes.orEmpty, axis: .vertical)
                        .lineLimit(2...6)
                }
                if !isNew {
                    Section {
                        Toggle(L10n.t("ios.shots.inTheCan"), isOn: $draft.done)
                    }
                }
            }
            .navigationTitle(isNew ? L10n.t("ios.shots.new") : L10n.t("ios.shots.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("ios.common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.save"), action: save)
                        .disabled(draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() {
        var shot = draft
        shot.description = shot.description.trimmingCharacters(in: .whitespacesAndNewlines)
        shot.lens = shot.lens.nilIfBlank
        shot.notes = shot.notes.nilIfBlank
        let ok = store.perform {
            if isNew {
                _ = try store.addShot(contentId: contentId, draft: shot)
            } else {
                try store.updateShot(shot)
            }
        }
        if ok { dismiss() }
    }
}

/// Big-touch-target checklist for use on set (one or several contents, e.g. a whole shoot day).
struct OnSetModeView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let contentIds: [String]

    private var allShots: [Shot] { contentIds.flatMap { store.shots(for: $0) } }

    var body: some View {
        NavigationStack {
            let total = allShots.count
            let done = allShots.filter(\.done).count
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        ProgressView(value: Double(done), total: Double(max(total, 1)))
                            .tint(.green)
                        Text(L10n.t("ios.shots.counter", ["done": String(done), "total": String(total)]))
                            .font(.title3.weight(.bold).monospacedDigit())
                    }
                    .padding(.vertical, 4)
                }
                ForEach(contentIds, id: \.self) { contentId in
                    let shots = store.shots(for: contentId)
                    if !shots.isEmpty {
                        Section(store.content(contentId)?.title ?? L10n.t("entity.content")) {
                            ForEach(shots) { shot in
                                Button {
                                    store.toggleShotDone(shot.id)
                                } label: {
                                    HStack(spacing: 16) {
                                        Image(systemName: shot.done ? "checkmark.square.fill" : "square")
                                            .font(.system(size: 34))
                                            .foregroundStyle(shot.done ? Color.green : Color.secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(shot.description)
                                                .font(.title3.weight(.semibold))
                                                .strikethrough(shot.done)
                                            Text(verbatim: "\(shot.framing.label) · \(shot.angle.label) · \(shot.movement.label) · \(shot.aspectRatio.label)")
                                                .font(.subheadline)
                                                .foregroundStyle(.secondary)
                                            if let notes = shot.notes, !notes.isEmpty {
                                                Text(notes)
                                                    .font(.footnote)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 8)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text(verbatim: "\(shot.description), \(shot.done ? L10n.t("ios.common.done") : L10n.t("ios.common.open"))"))
                                .accessibilityHint(L10n.t("ios.shots.toggleHint"))
                            }
                        }
                    }
                }
                if total == 0 {
                    EmptyStateView(title: L10n.t("ios.shots.noneTitle"), symbol: "video.slash")
                        .listRowBackground(Color.clear)
                }
            }
            .navigationTitle(L10n.t("ios.shots.onSet"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.doneButton")) { dismiss() }
                }
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}
