import SwiftUI

/// Script tab inside the content detail.
struct ScriptTab: View {
    @Environment(WorkspaceStore.self) private var store
    let content: ContentItem

    @State private var selectedVersionId: String?
    @State private var showEditor = false
    @State private var showChangeRequest = false

    private var history: [Script] { store.scriptHistory(for: content.id) }
    private var current: Script? { store.currentScript(for: content.id) }
    private var shown: Script? {
        if let id = selectedVersionId, let script = store.script(id) { return script }
        return current
    }

    var body: some View {
        if let script = shown {
            List {
                if history.count > 1 {
                    Section {
                        Picker(L10n.t("ios.common.version"), selection: Binding(
                            get: { script.id },
                            set: { selectedVersionId = $0 }
                        )) {
                            ForEach(history) { version in
                                Text(verbatim: "v\(version.version) – \(version.status.label)").tag(version.id)
                            }
                        }
                    }
                }

                Section {
                    HStack {
                        StatusBadge(text: script.status.label, tint: script.status.tint)
                        Spacer()
                        Text(verbatim: "v\(script.version) · \(DateUtils.timecode(script.totalDurationSec))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if script.status == .changesRequested, let note = script.reviewNote {
                        Label {
                            Text(note)
                        } icon: {
                            Image(systemName: "exclamationmark.bubble")
                                .foregroundStyle(.red)
                        }
                    }
                }

                ScriptBodySections(script: script)

                if script.id == current?.id {
                    actionSection(script)
                } else {
                    Section {
                        Text(L10n.t("ios.script.olderReadOnly"))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(isPresented: $showEditor) {
                ScriptEditorView(script: script)
            }
            .sheet(isPresented: $showChangeRequest) {
                ChangeRequestSheet(title: L10n.t("ios.review.requestChanges")) { note in
                    store.perform { try store.requestScriptChanges(scriptId: script.id, note: note) }
                }
            }
        } else {
            VStack(spacing: 16) {
                EmptyStateView(title: L10n.t("ios.script.emptyTitle"), symbol: "doc.text", message: L10n.t("ios.script.emptyMessage"))
                if store.canEditProduction {
                    Button {
                        store.perform { _ = try store.createScript(contentId: content.id) }
                    } label: {
                        Label(L10n.t("ios.script.create"), systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                }
                Spacer()
            }
        }
    }

    @ViewBuilder
    private func actionSection(_ script: Script) -> some View {
        Section(L10n.t("ios.common.actions")) {
            if script.isEditable && store.canEditProduction {
                Button {
                    showEditor = true
                } label: {
                    Label(L10n.t("ios.common.edit"), systemImage: "pencil")
                }
                Button {
                    store.perform { try store.submitScript(scriptId: script.id) }
                } label: {
                    Label(L10n.t("ios.script.submit"), systemImage: "paperplane")
                }
            }
            if script.status == .inReview {
                Button {
                    store.perform { try store.approveScript(scriptId: script.id) }
                } label: {
                    Label(L10n.t("ios.review.approve"), systemImage: "checkmark.seal")
                }
                .tint(.green)
                Button(role: .destructive) {
                    showChangeRequest = true
                } label: {
                    Label(L10n.t("ios.review.requestChanges"), systemImage: "arrow.uturn.backward")
                }
            }
            if (script.status == .approved || script.status == .inReview) && store.canEditProduction {
                Button {
                    store.perform {
                        let next = try store.newScriptVersion(scriptId: script.id)
                        selectedVersionId = next.id
                    }
                } label: {
                    Label(L10n.t("ios.script.newVersion"), systemImage: "doc.on.doc")
                }
            }
        }
    }
}

/// Read-only rendering of a script (hook, scenes, caption …), shared by tab and review.
struct ScriptBodySections: View {
    let script: Script

    var body: some View {
        Section(L10n.t("ios.script.hook")) {
            Text(script.hook.isEmpty ? "–" : script.hook)
                .font(.body.weight(.semibold))
        }

        Section(L10n.t("ios.script.scenes")) {
            if script.scenes.isEmpty {
                Text(L10n.t("ios.script.noScenes")).foregroundStyle(.secondary)
            }
            ForEach(Array(script.scenes.enumerated()), id: \.element.id) { index, scene in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(verbatim: "\(index + 1). \(scene.title)")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if let duration = scene.durationSec {
                            Text(verbatim: DateUtils.timecode(duration))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let voiceover = scene.voiceover, !voiceover.isEmpty {
                        SceneLine(label: L10n.t("ios.script.voiceover"), symbol: "mic", text: voiceover)
                    }
                    if let text = scene.onScreenText, !text.isEmpty {
                        SceneLine(label: L10n.t("ios.script.onScreenText"), symbol: "textformat", text: text)
                    }
                    if let visual = scene.visual, !visual.isEmpty {
                        SceneLine(label: L10n.t("ios.script.visual"), symbol: "camera", text: visual)
                    }
                }
                .padding(.vertical, 4)
            }
        }

        Section(L10n.t("ios.script.captionCta")) {
            Text(script.caption?.isEmpty == false ? (script.caption ?? "") : L10n.t("ios.script.noCaption"))
                .foregroundStyle(script.caption?.isEmpty == false ? Color.primary : Color.secondary)
            if let tags = script.hashtags, !tags.isEmpty {
                Text(tags.joined(separator: " "))
                    .foregroundStyle(Color.accentColor)
            }
            if let cta = script.cta, !cta.isEmpty {
                LabeledContent(L10n.t("ios.script.cta"), value: cta)
            }
        }
    }
}

private struct SceneLine: View {
    let label: String
    let symbol: String
    let text: String

    var body: some View {
        Label {
            Text(text).font(.subheadline)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(.secondary)
        }
        .accessibilityLabel(Text(verbatim: "\(label): \(text)"))
    }
}

/// Full-screen editor for draft / changes_requested scripts.
struct ScriptEditorView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Script
    @State private var hashtagText: String

    init(script: Script) {
        _draft = State(initialValue: script)
        _hashtagText = State(initialValue: (script.hashtags ?? []).joined(separator: " "))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.t("ios.script.hook")) {
                    TextField(L10n.t("ios.script.hookPlaceholder"), text: $draft.hook, axis: .vertical)
                        .lineLimit(2...4)
                }

                ForEach($draft.scenes) { $scene in
                    Section {
                        TextField(L10n.t("ios.script.sceneTitle"), text: $scene.title)
                        TextField(L10n.t("ios.script.voiceoverPlaceholder"), text: $scene.voiceover.orEmpty, axis: .vertical)
                            .lineLimit(1...6)
                        TextField(L10n.t("ios.script.onScreenTextPlaceholder"), text: $scene.onScreenText.orEmpty, axis: .vertical)
                        TextField(L10n.t("ios.script.visualPlaceholder"), text: $scene.visual.orEmpty, axis: .vertical)
                        HStack {
                            Text(L10n.t("ios.script.durationSec"))
                            Spacer()
                            TextField("–", text: $scene.durationSec.asText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 80)
                        }
                        Button(role: .destructive) {
                            draft.scenes.removeAll { $0.id == scene.id }
                        } label: {
                            Label(L10n.t("ios.script.removeScene"), systemImage: "trash")
                        }
                    } header: {
                        Text(L10n.t("ios.script.scene"))
                    }
                }

                Section {
                    Button {
                        draft.scenes.append(ScriptScene(id: nextSceneId(), title: L10n.t("ios.script.newScene"), voiceover: nil, onScreenText: nil, visual: nil, durationSec: nil))
                    } label: {
                        Label(L10n.t("ios.script.addScene"), systemImage: "plus")
                    }
                }

                Section(L10n.t("ios.script.caption")) {
                    TextField(L10n.t("ios.script.caption"), text: $draft.caption.orEmpty, axis: .vertical)
                        .lineLimit(3...8)
                    TextField("#hashtag #hashtag", text: $hashtagText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField(L10n.t("ios.script.ctaPlaceholder"), text: $draft.cta.orEmpty)
                }
            }
            .navigationTitle(L10n.t("ios.common.scriptVersion", ["version": String(draft.version)]))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("ios.common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.save"), action: save)
                }
            }
        }
    }

    private func nextSceneId() -> String {
        let used = Set(draft.scenes.map(\.id))
        var n = draft.scenes.count + 1
        while used.contains("s\(n)") { n += 1 }
        return "s\(n)"
    }

    private func save() {
        var updated = draft
        updated.hashtags = WorkspaceStore.parseHashtags(hashtagText)
        updated.caption = updated.caption.nilIfBlank
        updated.cta = updated.cta.nilIfBlank
        if store.perform({ try store.updateScript(updated) }) {
            dismiss()
        }
    }
}

/// Review screen opened from the approvals inbox.
struct ScriptReviewView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let scriptId: String
    @State private var showChangeRequest = false

    var body: some View {
        if let script = store.script(scriptId) {
            List {
                Section {
                    LabeledContent(L10n.t("entity.content"), value: store.content(script.contentId)?.title ?? "–")
                    if let content = store.content(script.contentId) {
                        LabeledContent(L10n.t("entity.client")) { ClientLabel(client: store.client(content.clientId)) }
                    }
                    LabeledContent(L10n.t("ios.common.version"), value: "v\(script.version)")
                    LabeledContent(L10n.t("ios.common.status")) { StatusBadge(text: script.status.label, tint: script.status.tint) }
                }
                ScriptBodySections(script: script)
            }
            .navigationTitle(L10n.t("stage.script_review"))
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                if script.status == .inReview {
                    HStack(spacing: 12) {
                        Button {
                            showChangeRequest = true
                        } label: {
                            Label(L10n.t("ios.review.changes"), systemImage: "arrow.uturn.backward")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)

                        Button {
                            if store.perform({ try store.approveScript(scriptId: script.id) }) {
                                dismiss()
                            }
                        } label: {
                            Label(L10n.t("ios.review.approve"), systemImage: "checkmark.seal")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    }
                    .controlSize(.large)
                    .padding()
                    .background(.bar)
                }
            }
            .sheet(isPresented: $showChangeRequest) {
                ChangeRequestSheet(title: L10n.t("ios.review.requestChanges")) { note in
                    let ok = store.perform { try store.requestScriptChanges(scriptId: script.id, note: note) }
                    if ok { dismiss() }
                    return ok
                }
            }
        } else {
            EmptyStateView(title: L10n.t("ios.script.notFound"), symbol: "doc.text")
        }
    }
}
