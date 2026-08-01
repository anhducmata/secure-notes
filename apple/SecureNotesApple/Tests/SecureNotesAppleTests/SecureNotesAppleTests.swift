import Foundation
import Testing
@testable import SecureNotesAppleCore

@Test func encryptsAndDecryptsNotes() throws {
    let note = SecureNote(
        title: "Daily standup",
        content: "Discuss background transcription",
        transcript: TranscriptDocument(lines: [
            TranscriptLine(speaker: .me, text: "hello"),
            TranscriptLine(speaker: .other, text: "world"),
        ])
    )

    let encrypted = try CryptoManager.encrypt(note: note, password: "hunter2")
    let decrypted = try CryptoManager.decrypt(payload: encrypted, password: "hunter2")

    #expect(decrypted.title == note.title)
    #expect(decrypted.content == note.content)
    #expect(decrypted.transcript?.renderedText == "You: hello\nOther: world")
}

@Test func persistsEncryptedNotes() async throws {
    let root = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let store = SecureNotesFileStore(fileURL: root.appendingPathComponent("notes.json"))
    let note = SecureNote(title: "Apple build", content: "Ship Swift version")

    try await store.save(note: note, password: "pass123")
    let loaded = try await store.loadNotes(password: "pass123")

    #expect(loaded.count == 1)
    #expect(loaded[0].title == "Apple build")
    #expect(loaded[0].content == "Ship Swift version")
}

@Test func schedulesBackgroundJobs() async throws {
    let root = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let coordinator = BackgroundTranscriptionCoordinator(jobsURL: root.appendingPathComponent("jobs.json"))
    let noteID = UUID()

    let job = try await coordinator.schedule(
        noteID: noteID,
        audioFileURL: root.appendingPathComponent("capture.pcm"),
        language: "en"
    )
    try await coordinator.markRunning(jobID: job.id)
    try await coordinator.markCompleted(jobID: job.id)

    let jobs = try await coordinator.loadJobs()

    #expect(jobs.count == 1)
    #expect(jobs[0].noteID == noteID)
    #expect(jobs[0].state == .completed)
}
