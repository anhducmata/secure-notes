import Foundation

public enum BackgroundTranscriptionState: String, Codable, Sendable {
    case queued
    case running
    case completed
    case failed
}

public struct BackgroundTranscriptionJob: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    public var noteID: UUID
    public var createdAt: Date
    public var audioFileURL: URL
    public var language: String
    public var state: BackgroundTranscriptionState
    public var lastError: String?

    public init(
        id: UUID = UUID(),
        noteID: UUID,
        createdAt: Date = Date(),
        audioFileURL: URL,
        language: String = "en",
        state: BackgroundTranscriptionState = .queued,
        lastError: String? = nil
    ) {
        self.id = id
        self.noteID = noteID
        self.createdAt = createdAt
        self.audioFileURL = audioFileURL
        self.language = language
        self.state = state
        self.lastError = lastError
    }
}

public actor BackgroundTranscriptionCoordinator {
    private let jobsURL: URL
    private let encoder = JSONEncoder.secureNotes
    private let decoder = JSONDecoder.secureNotes

    public init(jobsURL: URL) {
        self.jobsURL = jobsURL
    }

    public func schedule(noteID: UUID, audioFileURL: URL, language: String = "en") throws -> BackgroundTranscriptionJob {
        var jobs = try loadJobs()
        let job = BackgroundTranscriptionJob(noteID: noteID, audioFileURL: audioFileURL, language: language)
        jobs.insert(job, at: 0)
        try persist(jobs)
        return job
    }

    public func markRunning(jobID: UUID) throws {
        try update(jobID: jobID) {
            $0.state = .running
            $0.lastError = nil
        }
    }

    public func markCompleted(jobID: UUID) throws {
        try update(jobID: jobID) {
            $0.state = .completed
            $0.lastError = nil
        }
    }

    public func markFailed(jobID: UUID, message: String) throws {
        try update(jobID: jobID) {
            $0.state = .failed
            $0.lastError = message
        }
    }

    public func loadJobs() throws -> [BackgroundTranscriptionJob] {
        guard FileManager.default.fileExists(atPath: jobsURL.path) else { return [] }
        let data = try Data(contentsOf: jobsURL)
        if data.isEmpty { return [] }
        return try decoder.decode([BackgroundTranscriptionJob].self, from: data)
    }

    private func update(jobID: UUID, mutate: (inout BackgroundTranscriptionJob) -> Void) throws {
        var jobs = try loadJobs()
        guard let index = jobs.firstIndex(where: { $0.id == jobID }) else { return }
        mutate(&jobs[index])
        try persist(jobs)
    }

    private func persist(_ jobs: [BackgroundTranscriptionJob]) throws {
        let directory = jobsURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
        let data = try encoder.encode(jobs)
        try data.write(to: jobsURL, options: .atomic)
    }
}

#if canImport(BackgroundTasks)
import BackgroundTasks

public enum AppleBackgroundTranscriptionScheduler {
    public static let taskIdentifier = "com.mata.securenotes.transcription"

    public static func register(handler: @escaping @Sendable () async -> Void) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }

            processingTask.expirationHandler = {
                processingTask.setTaskCompleted(success: false)
            }

            Task {
                await handler()
                processingTask.setTaskCompleted(success: true)
            }
        }
    }

    public static func submit() throws {
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        try BGTaskScheduler.shared.submit(request)
    }
}
#else
public enum AppleBackgroundTranscriptionScheduler {
    public static let taskIdentifier = "com.mata.securenotes.transcription"

    public static func register(handler: @escaping @Sendable () async -> Void) {}
    public static func submit() throws {}
}
#endif

#if canImport(AVFoundation)
import AVFoundation

public enum AppleAudioRecorderError: Error, Equatable {
    case inputUnavailable
    case unsupportedFormat
}

public final class AppleAudioRecorder {
    private let engine = AVAudioEngine()

    public init() {}

    public func start(onBuffer: @escaping @Sendable (Data) -> Void) throws {
        #if os(iOS)
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .mixWithOthers])
        try audioSession.setActive(true)
        #endif

        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        guard format.commonFormat == .pcmFormatFloat32 else {
            throw AppleAudioRecorderError.unsupportedFormat
        }

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4_096, format: format) { buffer, _ in
            guard let data = Self.pcm16Data(from: buffer) else { return }
            onBuffer(data)
        }

        engine.prepare()
        try engine.start()
    }

    public func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
    }

    private static func pcm16Data(from buffer: AVAudioPCMBuffer) -> Data? {
        guard let channel = buffer.floatChannelData?.pointee else { return nil }
        let frameCount = Int(buffer.frameLength)
        var samples = Data(capacity: frameCount * MemoryLayout<Int16>.size)

        for index in 0..<frameCount {
            let clamped = max(-1.0, min(1.0, channel[index]))
            var pcm = Int16(clamped * Float(Int16.max)).littleEndian
            withUnsafeBytes(of: &pcm) { bytes in
                samples.append(contentsOf: bytes)
            }
        }

        return samples
    }
}
#else
public final class AppleAudioRecorder {
    public init() {}
    public func start(onBuffer: @escaping @Sendable (Data) -> Void) throws {}
    public func stop() {}
}
#endif
