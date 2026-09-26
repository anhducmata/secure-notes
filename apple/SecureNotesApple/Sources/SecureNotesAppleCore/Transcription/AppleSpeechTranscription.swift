import Foundation
#if canImport(Speech) && canImport(AVFoundation)
import Speech
import AVFoundation

public enum AppleSpeechRecognizerError: Error, Equatable {
    case notAuthorized
    case recognizerUnavailable
    case audioEngineFailed
}

/// Native Apple On-Device Speech Recognizer
/// Transcribes audio locally using Apple's Speech Framework (SFSpeechRecognizer).
/// Since on-device SFSpeechRecognizer does not provide real-time multi-speaker diarization,
/// all detected speech defaults to `.other` ("Other: ...") or `.me` as chosen.
public final class AppleOnDeviceSpeechService: NSObject, @unchecked Sendable {
    private let speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var defaultSpeaker: TranscriptSpeaker

    public init(locale: Locale = Locale(identifier: "en-US"), defaultSpeaker: TranscriptSpeaker = .other) {
        self.speechRecognizer = SFSpeechRecognizer(locale: locale)
        self.defaultSpeaker = defaultSpeaker
        super.init()
    }

    public static func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    public func startTranscription(
        onUpdate: @escaping @Sendable (TranscriptDocument) -> Void
    ) throws {
        guard let speechRecognizer, speechRecognizer.isAvailable else {
            throw AppleSpeechRecognizerError.recognizerUnavailable
        }

        // Cancel previous task if running
        stopTranscription()

        #if os(iOS)
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        #endif

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if speechRecognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        let speaker = self.defaultSpeaker
        self.recognitionTask = speechRecognizer.recognitionTask(with: request) { result, error in
            if let result {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty {
                    let doc = TranscriptDocument(lines: [
                        TranscriptLine(speaker: speaker, text: text, timestamp: Date())
                    ])
                    onUpdate(doc)
                }
            }

            if error != nil || (result?.isFinal ?? false) {
                // finished
            }
        }
    }

    public func stopTranscription() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
    }
}
#endif
