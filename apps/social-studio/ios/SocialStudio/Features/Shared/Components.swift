import SwiftUI
import UIKit

extension Color {
    /// "#RRGGBB" → Color (falls back to gray for invalid input).
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else {
            self.init(red: 0.5, green: 0.5, blue: 0.5)
            return
        }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

extension Stage {
    var tint: Color {
        switch self {
        case .idea: return .gray
        case .script: return .indigo
        case .scriptReview: return .orange
        case .shoot: return .red
        case .edit: return .purple
        case .cutReview: return .orange
        case .scheduled: return .blue
        case .published: return .green
        }
    }
}

extension ScriptStatus {
    var tint: Color {
        switch self {
        case .draft: return .gray
        case .inReview: return .orange
        case .changesRequested: return .red
        case .approved: return .green
        }
    }
}

extension MediaStatus {
    var tint: Color {
        switch self {
        case .uploaded: return .gray
        case .readyForEdit: return .blue
        case .inEdit: return .purple
        case .inReview: return .orange
        case .changesRequested: return .red
        case .approved: return .green
        }
    }
}

extension ShootStatus {
    var tint: Color {
        switch self {
        case .planned: return .gray
        case .confirmed: return .blue
        case .done: return .green
        case .cancelled: return .red
        }
    }
}

/// Small rounded label used for statuses.
@MainActor
struct StatusBadge: View {
    let text: String
    let tint: Color
    var symbol: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let symbol {
                Image(systemName: symbol)
                    .accessibilityHidden(true)
            }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(tint)
        .background(tint.opacity(0.14), in: Capsule())
    }
}

@MainActor
struct StageBadge: View {
    let stage: Stage
    var body: some View {
        StatusBadge(text: stage.label, tint: stage.tint, symbol: stage.symbol)
    }
}

@MainActor
struct ClientDot: View {
    let client: Client?
    var body: some View {
        Circle()
            .fill(Color(hex: client?.color ?? "#888888"))
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }
}

@MainActor
struct ClientLabel: View {
    let client: Client?
    var body: some View {
        HStack(spacing: 6) {
            ClientDot(client: client)
            Text(client?.name ?? L10n.t("ios.common.unknownClient"))
        }
    }
}

@MainActor
struct Avatar: View {
    let member: TeamMember?
    var size: CGFloat = 28

    var body: some View {
        Text(member?.initials ?? "?")
            .font(.system(size: size * 0.4, weight: .semibold))
            .frame(width: size, height: size)
            .background(Color.accentColor.opacity(0.18), in: Circle())
            .foregroundStyle(Color.accentColor)
            .accessibilityLabel(member?.name ?? L10n.t("ios.common.unknown"))
    }
}

@MainActor
struct AvatarStack: View {
    let members: [TeamMember]

    var body: some View {
        HStack(spacing: -8) {
            ForEach(members.prefix(4)) { member in
                Avatar(member: member, size: 24)
                    .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Toolbar menu to switch between L10n.t("ios.clientSwitcher.all") and a single client (like a project picker).
@MainActor
struct ClientSwitcher: View {
    @Environment(WorkspaceStore.self) private var store

    var body: some View {
        if store.isClientUser {
            ClientLabel(client: store.selectedClient ?? store.visibleClients.first)
                .font(.subheadline.weight(.semibold))
        } else {
            Menu {
                Button {
                    store.selectedClientId = nil
                } label: {
                    if store.selectedClientId == nil {
                        Label(L10n.t("ios.clientSwitcher.all"), systemImage: "checkmark")
                    } else {
                        Text(L10n.t("ios.clientSwitcher.all"))
                    }
                }
                Divider()
                ForEach(store.visibleClients) { client in
                    Button {
                        store.selectedClientId = client.id
                    } label: {
                        if store.selectedClientId == client.id {
                            Label(client.name, systemImage: "checkmark")
                        } else {
                            Text(client.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    if let client = store.selectedClient {
                        ClientDot(client: client)
                        Text(client.name)
                    } else {
                        Image(systemName: "person.2")
                            .accessibilityHidden(true)
                        Text(L10n.t("ios.clientSwitcher.all"))
                    }
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                        .accessibilityHidden(true)
                }
                .font(.subheadline.weight(.semibold))
            }
            .accessibilityLabel(L10n.t("ios.clientSwitcher.label"))
        }
    }
}

/// Horizontal chip used for filters.
@MainActor
struct FilterChip: View {
    let title: String
    var count: Int? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                if let count {
                    Text("\(count)")
                        .foregroundStyle(isSelected ? Color.white.opacity(0.85) : Color.secondary)
                }
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? Color.accentColor : Color(.secondarySystemBackground), in: Capsule())
            .foregroundStyle(isSelected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Row used in content lists.
@MainActor
struct ContentRow: View {
    @Environment(WorkspaceStore.self) private var store
    let content: ContentItem
    var showStage = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: content.format.symbol)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text(content.title)
                    .font(.body.weight(.semibold))
                    .lineLimit(2)
            }
            HStack(spacing: 8) {
                ClientLabel(client: store.client(content.clientId))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if showStage {
                    StageBadge(stage: content.stage)
                }
                Spacer(minLength: 0)
                AvatarStack(members: content.assigneeIds.compactMap { store.member($0) })
            }
            if let due = content.dueDate {
                Label(L10n.t("ios.content.due", ["date": DateUtils.displayDay(due)]), systemImage: "flag")
                    .font(.caption)
                    .foregroundStyle(due < DateUtils.todayString() && content.stage < .scheduled ? Color.red : Color.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Simple "flow" layout for chips that wraps lines (iOS 16+ Layout).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

extension View {
    /// Alert for errors raised inside a sheet. The root alert (RootView) cannot present above
    /// a sheet, so every sheet shows its own errors via `store.attempt { … }` + this modifier.
    func errorAlert(_ message: Binding<String?>) -> some View {
        alert(
            L10n.t("ios.alert.title"),
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { if !$0 { message.wrappedValue = nil } }
            )
        ) {
            Button(L10n.t("ios.common.ok"), role: .cancel) { message.wrappedValue = nil }
        } message: {
            Text(message.wrappedValue ?? "")
        }
    }
}

/// Sheet asking for a mandatory change note (DOMAIN_RULES: Kommentar Pflicht).
/// `onSubmit` returns nil on success or the localized error message to show inside the sheet.
@MainActor
struct ChangeRequestSheet: View {
    let title: String
    let onSubmit: (String) -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.t("ios.changeRequest.placeholder"), text: $note, axis: .vertical)
                        .lineLimit(4...10)
                } footer: {
                    Text(L10n.t("ios.changeRequest.footer"))
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("ios.common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("ios.common.send")) {
                        if let message = onSubmit(note) {
                            errorMessage = message
                        } else {
                            dismiss()
                        }
                    }
                    .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .errorAlert($errorMessage)
        }
        .presentationDetents([.medium, .large])
    }
}

@MainActor
struct EmptyStateView: View {
    let title: String
    let symbol: String
    var message: String? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            if let message { Text(message) }
        }
    }
}

extension Binding where Value == String? {
    /// Edits an optional string as non-optional text; empty text is stored as nil.
    var orEmpty: Binding<String> {
        Binding<String>(
            get: { self.wrappedValue ?? "" },
            set: { self.wrappedValue = $0.isEmpty ? nil : $0 }
        )
    }
}

extension Binding where Value == Double? {
    /// Edits an optional number as text ("" = nil, comma or dot as decimal separator).
    var asText: Binding<String> {
        Binding<String>(
            get: {
                guard let value = self.wrappedValue else { return "" }
                return value.rounded() == value ? String(Int(value)) : String(value)
            },
            set: { text in
                let normalized = text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
                if normalized.isEmpty {
                    self.wrappedValue = nil
                } else if let value = Double(normalized), value >= 0, value.isFinite {
                    self.wrappedValue = value
                }
            }
        )
    }
}
