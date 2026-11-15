import SwiftUI
import UIKit

extension Color {
    /// "#RRGGBB" → Color (falls back to gray for invalid input).
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else {
            self = .gray
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

struct StageBadge: View {
    let stage: Stage
    var body: some View {
        StatusBadge(text: stage.label, tint: stage.tint, symbol: stage.symbol)
    }
}

struct ClientDot: View {
    let client: Client?
    var body: some View {
        Circle()
            .fill(Color(hex: client?.color ?? "#888888"))
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }
}

struct ClientLabel: View {
    let client: Client?
    var body: some View {
        HStack(spacing: 6) {
            ClientDot(client: client)
            Text(client?.name ?? "Unbekannter Kunde")
        }
    }
}

struct Avatar: View {
    let member: TeamMember?
    var size: CGFloat = 28

    var body: some View {
        Text(member?.initials ?? "?")
            .font(.system(size: size * 0.4, weight: .semibold))
            .frame(width: size, height: size)
            .background(Color.accentColor.opacity(0.18), in: Circle())
            .foregroundStyle(Color.accentColor)
            .accessibilityLabel(member?.name ?? "Unbekannt")
    }
}

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

/// Toolbar menu to switch between "Alle Kunden" and a single client (like a project picker).
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
                        Label("Alle Kunden", systemImage: "checkmark")
                    } else {
                        Text("Alle Kunden")
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
                        Text("Alle Kunden")
                    }
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                        .accessibilityHidden(true)
                }
                .font(.subheadline.weight(.semibold))
            }
            .accessibilityLabel("Kunde wählen")
        }
    }
}

/// Horizontal chip used for filters.
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
                Label("Fällig \(DateUtils.displayDay(due))", systemImage: "flag")
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

/// Sheet asking for a mandatory change note (DOMAIN_RULES: Kommentar Pflicht).
struct ChangeRequestSheet: View {
    let title: String
    let onSubmit: (String) -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Was soll geändert werden?", text: $note, axis: .vertical)
                        .lineLimit(4...10)
                } footer: {
                    Text("Pflichtfeld – die Rückmeldung wird dem Team angezeigt.")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Senden") {
                        if onSubmit(note) { dismiss() }
                    }
                    .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

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
