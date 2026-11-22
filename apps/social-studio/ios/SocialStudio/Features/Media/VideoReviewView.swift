import AVKit
import SwiftUI

/// Video review with time-stamped comments, approve / request changes.
@MainActor
struct VideoReviewView: View {
    @Environment(WorkspaceStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let mediaId: String

    @State private var player: AVPlayer?
    @State private var commentText = ""
    @State private var attachTimestamp = true
    @State private var showChangeRequest = false
    @State private var showResolved = false
    /// Pop this screen only after the change-request sheet has finished dismissing.
    @State private var popAfterSheet = false
    @FocusState private var commentFocused: Bool

    var body: some View {
        // `mediaAsset` is scoped: nil for other clients' files and for raw footage without `media.viewRaw`.
        if let asset = store.mediaAsset(mediaId) {
            content(for: asset)
        } else {
            EmptyStateView(title: L10n.t("ios.media.unavailable"), symbol: "film")
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
                                Text(localURL == nil ? L10n.t("ios.media.metadataOnly") : L10n.t("ios.media.loading"))
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

                LabeledContent(L10n.t("entity.content"), value: store.content(asset.contentId)?.title ?? "–")
                LabeledContent(L10n.t("ios.common.version"), value: "\(asset.kind.label) v\(asset.version)")
                LabeledContent(L10n.t("ios.common.status")) { StatusBadge(text: asset.status.label, tint: asset.status.tint) }
                LabeledContent(L10n.t("ios.media.uploadedBy"), value: "\(store.member(asset.uploadedById)?.name ?? "–") · \(DateUtils.displayDateTime(asset.uploadedAt))")
                LabeledContent(L10n.t("ios.media.size"), value: DateUtils.fileSize(asset.sizeBytes))
            }

            Section {
                let comments = asset.comments
                    .filter { showResolved || !$0.resolved }
                    .sorted { ($0.timestampSec ?? .infinity, $0.createdAt) < ($1.timestampSec ?? .infinity, $1.createdAt) }
                if comments.isEmpty {
                    Text(asset.comments.isEmpty ? L10n.t("ios.review.noComments") : L10n.t("ios.review.allResolved"))
                        .foregroundStyle(.secondary)
                }
                ForEach(comments) { comment in
                    CommentRow(comment: comment, onSeek: { seconds in seek(to: seconds) }) {
                        store.toggleCommentResolved(mediaId: asset.id, commentId: comment.id)
                    }
                }
            } header: {
                HStack {
                    Text(L10n.t("ios.review.comments"))
                    Spacer()
                    Toggle(L10n.t("ios.review.showResolved"), isOn: $showResolved)
                        .toggleStyle(.button)
                        .controlSize(.mini)
                        .textCase(nil)
                }
            }

            if store.can(.mediaComment, clientId: store.content(asset.contentId)?.clientId) {
            Section(L10n.t("ios.review.newComment")) {
                TextField(L10n.t("ios.review.feedbackPlaceholder"), text: $commentText, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($commentFocused)
                if player != nil {
                    Toggle(L10n.t("ios.review.attachTimestamp"), isOn: $attachTimestamp)
                }
                Button {
                    addComment(asset)
                } label: {
                    Label(L10n.t("ios.review.comment"), systemImage: "paperplane")
                }
                .disabled(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            }
        }
        .navigationTitle(asset.fileName)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if asset.kind.isReviewable && asset.status == .inReview && !store.isLatestCut(asset) {
                // Only the newest version can be approved or rejected (DOMAIN_RULES: Medien).
                Text(L10n.t("ios.review.newerVersion"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.bar)
            } else if asset.kind.isReviewable && asset.status == .inReview
                        && store.can(.mediaReview, clientId: store.content(asset.contentId)?.clientId) {
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
                        if store.perform({ try store.approveMedia(mediaId: asset.id) }) {
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
        .sheet(isPresented: $showChangeRequest, onDismiss: {
            if popAfterSheet { dismiss() }
        }) {
            ChangeRequestSheet(title: L10n.t("ios.review.requestChanges")) { note in
                let message = store.attempt { try store.requestMediaChanges(mediaId: asset.id, note: note) }
                if message == nil { popAfterSheet = true }
                return message
            }
        }
        .onAppear {
            if player == nil, let localURL {
                // Cuts must be audible even when the ring/silent switch is on.
                try? AVAudioSession.sharedInstance().setCategory(.playback)
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

@MainActor
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
                    Text(store.member(comment.authorId)?.name ?? L10n.t("ios.common.unknown"))
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
                        .accessibilityLabel(L10n.t("ios.review.jumpTo", ["time": DateUtils.timecode(stamp)]))
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
            .accessibilityLabel(comment.resolved ? L10n.t("ios.review.markOpen") : L10n.t("ios.review.markResolved"))
        }
        .padding(.vertical, 2)
    }
}
