import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Media of one content: upload (Photos / Files), release raw footage for editing,
/// upload cuts for review.
struct MediaListView: View {
    @Environment(WorkspaceStore.self) private var store
    let content: ContentItem

    @State private var uploadKind: MediaKind = .raw
    @State private var pickerItem: PhotosPickerItem?
    @State private var showFileImporter = false
    @State private var isImporting = false

    private var assets: [MediaAsset] { store.media(for: content.id) }
    private var uploadKinds: [MediaKind] { [.raw, .cut, .finalCut] }

    var body: some View {
        List {
            if store.canEditProduction {
                Section {
                    Picker(L10n.t("ios.media.kind"), selection: $uploadKind) {
                        ForEach(uploadKinds) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    PhotosPicker(selection: $pickerItem, matching: .videos) {
                        Label(L10n.t("ios.media.fromPhotos"), systemImage: "photo.on.rectangle")
                    }
                    .disabled(isImporting)

                    Button {
                        showFileImporter = true
                    } label: {
                        Label(L10n.t("ios.media.fromFiles"), systemImage: "folder")
                    }
                    .disabled(isImporting)

                    if isImporting {
                        HStack {
                            ProgressView()
                            Text(L10n.t("ios.media.importing"))
                                .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text(L10n.t("ios.media.upload"))
                } footer: {
                    Text(uploadKind.isReviewable
                         ? L10n.t("ios.media.hintCut")
                         : L10n.t("ios.media.hintRaw"))
                }
            }

            ForEach(MediaKind.allCases) { kind in
                let items = assets.filter { $0.kind == kind }
                if !items.isEmpty {
                    Section(kind.label) {
                        ForEach(items) { asset in
                            MediaRow(asset: asset)
                        }
                    }
                }
            }

            if assets.isEmpty {
                EmptyStateView(title: L10n.t("ios.media.none"), symbol: "film.stack")
                    .listRowBackground(Color.clear)
            }
        }
        .onChange(of: pickerItem) { _, newItem in
            guard let newItem else { return }
            Task { await importFromPhotos(newItem) }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.movie, .video, .audiovisualContent]) { result in
            switch result {
            case .success(let url):
                Task { await importFromFiles(url) }
            case .failure(let error):
                store.lastError = L10n.t("ios.error.fileOpen", ["reason": error.localizedDescription])
            }
        }
    }

    @MainActor
    private func importFromPhotos(_ item: PhotosPickerItem) async {
        isImporting = true
        defer {
            isImporting = false
            pickerItem = nil
        }
        do {
            guard let movie = try await item.loadTransferable(type: PickedMovie.self) else {
                store.lastError = L10n.t("ios.error.videoLoad")
                return
            }
            defer { try? FileManager.default.removeItem(at: movie.url.deletingLastPathComponent()) }
            try await store.importVideo(contentId: content.id, kind: uploadKind, from: movie.url, originalName: movie.suggestedName)
        } catch {
            store.lastError = error.localizedDescription
        }
    }

    @MainActor
    private func importFromFiles(_ url: URL) async {
        isImporting = true
        defer { isImporting = false }
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        do {
            try await store.importVideo(contentId: content.id, kind: uploadKind, from: url, originalName: url.lastPathComponent)
        } catch {
            store.lastError = error.localizedDescription
        }
    }
}

struct MediaRow: View {
    @Environment(WorkspaceStore.self) private var store
    let asset: MediaAsset

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink {
                VideoReviewView(mediaId: asset.id)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: asset.kind == .raw ? "film.stack" : "film")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(asset.fileName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        HStack(spacing: 6) {
                            Text(verbatim: "v\(asset.version)")
                            if let duration = asset.durationSec {
                                Text(verbatim: "· \(DateUtils.timecode(duration))")
                            }
                            Text(verbatim: "· \(DateUtils.fileSize(asset.sizeBytes))")
                            if !asset.comments.isEmpty {
                                Label(String(asset.comments.filter { !$0.resolved }.count), systemImage: "text.bubble")
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        StatusBadge(text: asset.status.label, tint: asset.status.tint)
                    }
                }
            }

            if store.canEditProduction && asset.kind == .raw {
                if asset.status == .uploaded {
                    Button {
                        store.perform { try store.releaseForEdit(mediaId: asset.id) }
                    } label: {
                        Label(L10n.t("ios.media.release"), systemImage: "scissors")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                } else if asset.status == .readyForEdit {
                    Button {
                        store.perform { try store.startEdit(mediaId: asset.id) }
                    } label: {
                        Label(L10n.t("ios.media.startEdit"), systemImage: "play.rectangle")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
