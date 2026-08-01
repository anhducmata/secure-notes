import Foundation

public actor SecureNotesFileStore {
    private let fileURL: URL
    private let encoder = JSONEncoder.secureNotes
    private let decoder = JSONDecoder.secureNotes

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public func loadRecords() throws -> [EncryptedNoteRecord] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        let data = try Data(contentsOf: fileURL)
        if data.isEmpty { return [] }
        return try decoder.decode([EncryptedNoteRecord].self, from: data)
    }

    public func loadNotes(password: String) throws -> [SecureNote] {
        try loadRecords()
            .map { try CryptoManager.decrypt(payload: $0.payload, password: password) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    @discardableResult
    public func save(note: SecureNote, password: String) throws -> EncryptedNoteRecord {
        var records = try loadRecords()
        let sanitized = normalize(note)
        let record = EncryptedNoteRecord(
            id: sanitized.id,
            updatedAt: sanitized.updatedAt,
            payload: try CryptoManager.encrypt(note: sanitized, password: password)
        )

        if let existing = records.firstIndex(where: { $0.id == sanitized.id }) {
            records[existing] = record
        } else {
            records.append(record)
        }

        try persist(records.sorted { $0.updatedAt > $1.updatedAt })
        return record
    }

    public func delete(noteID: UUID) throws {
        let records = try loadRecords().filter { $0.id != noteID }
        try persist(records)
    }

    public func appendTranscript(
        noteID: UUID,
        transcript: TranscriptDocument,
        password: String
    ) throws -> SecureNote? {
        var notes = try loadNotes(password: password)
        guard let index = notes.firstIndex(where: { $0.id == noteID }) else { return nil }
        let updated = notes[index].applyingTranscript(transcript)
        notes[index] = updated
        try saveAll(notes: notes, password: password)
        return updated
    }

    public func replaceAll(notes: [SecureNote], password: String) throws {
        try saveAll(notes: notes, password: password)
    }

    private func saveAll(notes: [SecureNote], password: String) throws {
        let records = try notes.map { note in
            EncryptedNoteRecord(
                id: note.id,
                updatedAt: note.updatedAt,
                payload: try CryptoManager.encrypt(note: normalize(note), password: password)
            )
        }
        try persist(records.sorted { $0.updatedAt > $1.updatedAt })
    }

    private func persist(_ records: [EncryptedNoteRecord]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
        let data = try encoder.encode(records)
        try data.write(to: fileURL, options: .atomic)
    }

    private func normalize(_ note: SecureNote) -> SecureNote {
        var normalized = note
        normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "New Note"
            : normalized.title
        normalized.updatedAt = Date()
        return normalized
    }
}
