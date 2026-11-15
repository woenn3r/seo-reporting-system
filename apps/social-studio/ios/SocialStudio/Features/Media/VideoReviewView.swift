import AVKit
import SwiftUI

/// Video review with time-stamped comments, approve / request changes.
struct VideoReviewView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let mediaId: String

    @State private var player: AVPlayer?
    @State private var commentText = ""
    @State private var attachTimestamp = true
    @State private var showChangeRequest = false
    @State private var showResolved = false
    @FocusState private var commentFocused: Bool

    var body: some View {
        if let asset = store.mediaAsset(mediaId), store.canSeeRawMedia || asset.kind != .raw {
            content(for: asset)
        } else {
            EmptyStateView(title: "Datei nicht verfügbar", symbol: "film")
        }
    }

    @ViewBuilder
    private func content(for asset: MediaAsset) -> some View {
        let localURL = store.mediaURL(for: asset)
        List {
            Section {
                Group {
                    if let player {
                        VideoPlayer(player: player)
                    } else {
                        ZStack {
                            Rectangle().fill(Color.black.opacity(0.85))
                            VStack(spacing: 8) {
                                Image(systemName: "film")
                                    .font(.largeTitle)
                                Text(localURL == nil ? "Datei nur als Metadaten vorhanden" : "Video wird geladen …")
                                    .font(.footnote)
                                    .multilineTextAlignment(.center)
                            }
                            .foregroundStyle(.white.opacity(0.8))
                            .padding()
                        }
                    }
                }
                .aspectRatio(16 / 9, contentMode: .fit)
                .listRowInsets(EdgeInsets())

                LabeledContent("Content", value: store.content(asset.contentId)?.title ?? "–")
                LabeledContent("Version", value: "\(asset.kind.label) v\(asset.version)")
                LabeledContent("Status") { StatusBadge(text: asset.status.label, tint: asset.status.tint) }
                LabeledContent("Hochgeladen", value: "\(store.member(asset.uploadedById)?.name ?? "–") · \(DateUtils.displayDateTime(asset.uploadedAt))")
                LabeledContent("Größe", value: DateUtils.fileSize(asset.sizeBytes))
            }

            Section {
                let comments = asset.comments
                    .filter { showResolved || !$0.resolved }
                    .sorted { ($0.timestampSec ?? .infinity, $0.createdAt) < ($1.timestampSec ?? .infinity, $1.createdAt) }
                if comments.isEmpty {
                    Text(asset.comments.isEmpty ? "Noch keine Kommentare." : "Alle Kommentare erledigt.")
                        .foregroundStyle(.secondary)
                }
                ForEach(comments) { comment in
                    CommentRow(comment: comment, onSeek: { seconds in seek(to: seconds) }) {
                        store.toggleCommentResolved(mediaId: asset.id, commentId: comment.id)
                    }
                }
            } header: {
                HStack {
                    Text("Kommentare")
                    Spacer()
                    Toggle("Erledigte zeigen", isOn: $showResolved)
                        .toggleStyle(.button)
                        .controlSize(.mini)
                        .textCase(nil)
                }
            }

            Section("Neuer Kommentar") {
                TextField("Feedback …", text: $commentText, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($commentFocused)
                if player != nil {
                    Toggle("Aktuelle Videoposition anhängen", isOn: $attachTimestamp)
                }
                Button {
                    addComment(asset)
                } label: {
                    Label("Kommentieren", systemImage: "paperplane")
                }
                .disabled(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle(asset.fileName)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if asset.kind.isReviewable && asset.status == .inReview {
                HStack(spacing: 12) {
                    Button {
                        showChangeRequest = true
                    } label: {
                        Label("Änderungen", systemImage: "arrow.uturn.backward")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)

                    Button {
                        if store.perform({ try store.approveMedia(mediaId: asset.id) }) {
                            dismiss()
                        }
                    } label: {
                        Label("Freigeben", systemImage: "checkmark.seal")
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
            ChangeRequestSheet(title: "Änderungen anfordern") { note in
                let ok = store.perform { try store.requestMediaChanges(mediaId: asset.id, note: note) }
                if ok { dismiss() }
                return ok
            }
        }
        .onAppear {
            if player == nil, let localURL {
                player = AVPlayer(url: localURL)
            }
        }
        .onDisappear {
            player?.pause()
        }
    }

    private func currentTime() -> Double? {
        guard let player else { return nil }
        let seconds = player.currentTime().seconds
        return seconds.isFinite ? (seconds * 10).rounded() / 10 : nil
    }

    private func seek(to seconds: Double) {
        guard let player else { return }
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
        player.pause()
    }

    private func addComment(_ asset: MediaAsset) {
        let stamp = attachTimestamp ? currentTime() : nil
        if store.perform({ try store.addComment(mediaId: asset.id, text: commentText, timestampSec: stamp) }) {
            commentText = ""
            commentFocused = false
        }
    }
}

private struct CommentRow: View {
    @Environment(WorkspaceStore.self) private var store
    let comment: ReviewComment
    let onSeek: (Double) -> Void
    let onToggleResolved: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Avatar(member: store.member(comment.authorId), size: 28)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(store.member(comment.authorId)?.name ?? "Unbekannt")
                        .font(.subheadline.weight(.semibold))
                    if let stamp = comment.timestampSec {
                        Button {
                            onSeek(stamp)
                        } label: {
                            Text(DateUtils.timecode(stamp))
                                .font(.caption.monospacedDigit().weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Zu \(DateUtils.timecode(stamp)) springen")
                    }
                }
                Text(comment.text)
                    .font(.subheadline)
                    .strikethrough(comment.resolved)
                    .foregroundStyle(comment.resolved ? Color.secondary : Color.primary)
                Text(DateUtils.relative(comment.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button(action: onToggleResolved) {
                Image(systemName: comment.resolved ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(comment.resolved ? Color.green : Color.secondary)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(comment.resolved ? "Als offen markieren" : "Als erledigt markieren")
        }
        .padding(.vertical, 2)
    }
}
