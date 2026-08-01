import Foundation

public enum NoteAttachmentKind: String, Codable, Sendable {
    case image
    case text
    case audio
}

public struct NoteAttachment: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    public var name: String
    public var kind: NoteAttachmentKind
    public var size: Int
    public var data: Data?

    public init(
        id: UUID = UUID(),
        name: String,
        kind: NoteAttachmentKind,
        size: Int,
        data: Data? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.size = size
        self.data = data
    }
}

public enum TranscriptSpeaker: String, Codable, Sendable {
    case me = "You"
    case other = "Other"

    public var label: String { rawValue }
}

public struct TranscriptLine: Codable, Equatable, Sendable {
    public var speaker: TranscriptSpeaker
    public var text: String
    public var timestamp: Date

    public init(speaker: TranscriptSpeaker, text: String, timestamp: Date = Date()) {
        self.speaker = speaker
        self.text = text
        self.timestamp = timestamp
    }
}

public struct TranscriptDocument: Codable, Equatable, Sendable {
    public var lines: [TranscriptLine]

    public init(lines: [TranscriptLine] = []) {
        self.lines = lines
    }

    public var renderedText: String {
        lines
            .sorted { $0.timestamp < $1.timestamp }
            .map { "\($0.speaker.label): \($0.text.trimmingCharacters(in: .whitespacesAndNewlines))" }
            .filter { !$0.hasSuffix(":") }
            .joined(separator: "\n")
    }
}

public struct SecureNote: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    public var title: String
    public var content: String
    public var updatedAt: Date
    public var attachments: [NoteAttachment]
    public var transcript: TranscriptDocument?

    public init(
        id: UUID = UUID(),
        title: String = "New Note",
        content: String = "",
        updatedAt: Date = Date(),
        attachments: [NoteAttachment] = [],
        transcript: TranscriptDocument? = nil
    ) {
        self.id = id
        self.title = title
        self.content = content
        self.updatedAt = updatedAt
        self.attachments = attachments
        self.transcript = transcript
    }

    public func applyingTranscript(_ transcript: TranscriptDocument) -> SecureNote {
        var updated = self
        let transcriptText = transcript.renderedText
        if !transcriptText.isEmpty {
            let separator = content.isEmpty || content.hasSuffix("\n") ? "" : "\n\n"
            updated.content = content + separator + transcriptText
        }
        updated.transcript = transcript
        updated.updatedAt = Date()
        return updated
    }
}

public struct EncryptedNotePayload: Codable, Equatable, Sendable {
    public var ciphertext: String
    public var iv: String
    public var salt: String
    public var version: Int

    public init(ciphertext: String, iv: String, salt: String, version: Int = 1) {
        self.ciphertext = ciphertext
        self.iv = iv
        self.salt = salt
        self.version = version
    }
}

public struct EncryptedNoteRecord: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    public var updatedAt: Date
    public var payload: EncryptedNotePayload

    public init(id: UUID, updatedAt: Date, payload: EncryptedNotePayload) {
        self.id = id
        self.updatedAt = updatedAt
        self.payload = payload
    }
}
