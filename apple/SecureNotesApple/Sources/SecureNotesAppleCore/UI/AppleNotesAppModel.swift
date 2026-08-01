#if canImport(SwiftUI)
import Foundation
import SwiftUI

@MainActor
public final class AppleNotesAppModel: ObservableObject {
    @Published public private(set) var notes: [SecureNote] = []
    @Published public var selectedNoteID: UUID?
    @Published public var password = ""
    @Published public var sonioxAPIKey = ""
    @Published public var transcriptionLanguage = "en"
    @Published public var status = "Ready"

    private let store: SecureNotesFileStore

    public init(store: SecureNotesFileStore) {
        self.store = store
    }

    public var selectedNoteBinding: Binding<SecureNote?> {
        Binding(
            get: { [weak self] in
                guard let self, let selectedNoteID else { return nil }
                return notes.first(where: { $0.id == selectedNoteID })
            },
            set: { [weak self] newValue in
                guard let self else { return }
                if let newValue {
                    if let index = notes.firstIndex(where: { $0.id == newValue.id }) {
                        notes[index] = newValue
                    }
                    selectedNoteID = newValue.id
                } else {
                    selectedNoteID = nil
                }
            }
        )
    }

    public func loadNotes() async {
        guard !password.isEmpty else {
            notes = []
            status = "Set an encryption password to load notes."
            return
        }

        do {
            notes = try await store.loadNotes(password: password)
            selectedNoteID = selectedNoteID ?? notes.first?.id
            status = "Loaded \(notes.count) notes"
        } catch {
            status = "Failed to decrypt notes: \(error.localizedDescription)"
        }
    }

    public func createNote() {
        let note = SecureNote(title: "New Note")
        notes.insert(note, at: 0)
        selectedNoteID = note.id
    }

    public func updateSelectedNote(title: String, content: String) {
        guard let selectedNoteID, let index = notes.firstIndex(where: { $0.id == selectedNoteID }) else { return }
        notes[index].title = title
        notes[index].content = content
        notes[index].updatedAt = Date()
    }

    public func persistNotes() async {
        guard !password.isEmpty else {
            status = "Missing encryption password"
            return
        }

        do {
            try await store.replaceAll(notes: notes, password: password)
            status = "Saved"
        } catch {
            status = "Save failed: \(error.localizedDescription)"
        }
    }

    public func queueBackgroundTranscription(audioFileURL: URL, coordinator: BackgroundTranscriptionCoordinator) async {
        guard let selectedNoteID else {
            status = "Select a note before queueing transcription"
            return
        }

        do {
            _ = try await coordinator.schedule(noteID: selectedNoteID, audioFileURL: audioFileURL, language: transcriptionLanguage)
            status = "Background transcription queued"
        } catch {
            status = "Could not queue transcription: \(error.localizedDescription)"
        }
    }
}

public struct SecureNotesAppleRootView: View {
    @ObservedObject private var model: AppleNotesAppModel

    public init(model: AppleNotesAppModel) {
        self.model = model
    }

    public var body: some View {
        NavigationSplitView {
            List(selection: $model.selectedNoteID) {
                ForEach(model.notes) { note in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(note.title)
                            .font(.headline)
                        Text(note.updatedAt, style: .relative)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .tag(note.id)
                }
            }
            .toolbar {
                Button("New Note") { model.createNote() }
                Button("Reload") { Task { await model.loadNotes() } }
            }
        } detail: {
            if let note = model.selectedNoteBinding.wrappedValue {
                SecureNoteEditorView(model: model, note: note)
            } else {
                ContentUnavailableView("Select a note", systemImage: "note.text")
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                SecureField("Encryption password", text: $model.password)
                    .textFieldStyle(.roundedBorder)
                TextField("Soniox API key", text: $model.sonioxAPIKey)
                    .textFieldStyle(.roundedBorder)
                Button("Load") { Task { await model.loadNotes() } }
                Button("Save") { Task { await model.persistNotes() } }
            }
            .padding()
            .background(.ultraThinMaterial)
        }
    }
}

private struct SecureNoteEditorView: View {
    @ObservedObject var model: AppleNotesAppModel
    @State var title: String
    @State var content: String
    let noteID: UUID

    init(model: AppleNotesAppModel, note: SecureNote) {
        self.model = model
        _title = State(initialValue: note.title)
        _content = State(initialValue: note.content)
        self.noteID = note.id
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Title", text: $title)
                .textFieldStyle(.roundedBorder)
            TextEditor(text: $content)
                .font(.body.monospaced())
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.secondary.opacity(0.2)))
            Text(model.status)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .onChange(of: title) { _, _ in model.updateSelectedNote(title: title, content: content) }
        .onChange(of: content) { _, _ in model.updateSelectedNote(title: title, content: content) }
        .navigationTitle(title.isEmpty ? "New Note" : title)
        .id(noteID)
    }
}
#endif
