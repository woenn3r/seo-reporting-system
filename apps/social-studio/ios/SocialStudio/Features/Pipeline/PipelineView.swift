import SwiftUI

struct PipelineView: View {
    @Environment(WorkspaceStore.self) private var store
    @State private var stageFilter: Stage?
    @State private var searchText = ""
    @State private var showCreate = false

    private var filtered: [ContentItem] {
        store.scopedContents.filter { item in
            (stageFilter == nil || item.stage == stageFilter)
                && (searchText.isEmpty || item.title.localizedCaseInsensitiveContains(searchText))
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            FilterChip(title: "Alle", count: store.scopedContents.count, isSelected: stageFilter == nil) {
                                stageFilter = nil
                            }
                            ForEach(Stage.allCases) { stage in
                                FilterChip(title: stage.label, count: store.contents(in: stage).count, isSelected: stageFilter == stage) {
                                    stageFilter = stageFilter == stage ? nil : stage
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                ForEach(Stage.allCases) { stage in
                    let items = filtered.filter { $0.stage == stage }
                    if !items.isEmpty {
                        Section {
                            ForEach(items) { item in
                                NavigationLink(value: item.id) {
                                    ContentRow(content: item, showStage: false)
                                }
                                .contextMenu {
                                    if store.canEditProduction {
                                        stageMenu(for: item)
                                    }
                                }
                            }
                        } header: {
                            Label("\(stage.label) · \(items.count)", systemImage: stage.symbol)
                                .foregroundStyle(stage.tint)
                        }
                    }
                }

                if filtered.isEmpty {
                    EmptyStateView(
                        title: "Kein Content",
                        symbol: "tray",
                        message: searchText.isEmpty ? "Lege oben rechts neuen Content an." : "Keine Treffer für „\(searchText)“."
                    )
                    .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $searchText, prompt: "Content suchen")
            .navigationTitle("Pipeline")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { ClientSwitcher() }
                if store.canEditProduction {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Label("Neuer Content", systemImage: "plus")
                        }
                    }
                }
            }
            .navigationDestination(for: String.self) { contentId in
                ContentDetailView(contentId: contentId)
            }
            .sheet(isPresented: $showCreate) {
                CreateContentView()
            }
        }
    }

    @ViewBuilder
    private func stageMenu(for item: ContentItem) -> some View {
        Menu("Verschieben nach …") {
            ForEach(Stage.allCases) { stage in
                Button {
                    store.perform { try store.moveStage(contentId: item.id, to: stage) }
                } label: {
                    Label(stage.label, systemImage: stage.symbol)
                }
                .disabled(stage == item.stage)
            }
        }
    }
}
