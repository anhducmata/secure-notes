import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct SonioxToken: Codable, Equatable, Sendable {
    public var text: String
    public var isFinal: Bool

    enum CodingKeys: String, CodingKey {
        case text
        case isFinal = "is_final"
    }

    public init(text: String, isFinal: Bool) {
        self.text = text
        self.isFinal = isFinal
    }
}

public struct SonioxResponse: Codable, Equatable, Sendable {
    public var tokens: [SonioxToken]
    public var endpoint: Bool
    public var finished: Bool
    public var errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case tokens
        case endpoint
        case finished
        case errorMessage = "error_message"
    }

    public init(tokens: [SonioxToken] = [], endpoint: Bool = false, finished: Bool = false, errorMessage: String? = nil) {
        self.tokens = tokens
        self.endpoint = endpoint
        self.finished = finished
        self.errorMessage = errorMessage
    }
}

public struct SonioxSessionConfiguration: Sendable {
    public var apiKey: String
    public var language: String
    public var endpoint: URL
    public var model: String

    public init(
        apiKey: String,
        language: String = "en",
        endpoint: URL = URL(string: "wss://stt-rt.soniox.com/transcribe-websocket")!,
        model: String = "stt-rt-v4"
    ) {
        self.apiKey = apiKey
        self.language = language
        self.endpoint = endpoint
        self.model = model
    }
}

public enum SonioxClientError: Error, Equatable {
    case notConnected
    case server(String)
}

public actor SonioxWebSocketClient {
    private let session: URLSession
    private var socket: URLSessionWebSocketTask?
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func connect(configuration: SonioxSessionConfiguration) throws {
        let task = session.webSocketTask(with: configuration.endpoint)
        task.resume()
        self.socket = task

        let handshake = [
            "api_key": configuration.apiKey,
            "model": configuration.model,
            "audio_format": "pcm_s16le",
            "sample_rate": 16_000,
            "num_channels": 1,
            "language": configuration.language,
            "enable_endpoint_detection": true,
            "enable_speaker_diarization": false,
        ] as [String : Any]

        let data = try JSONSerialization.data(withJSONObject: handshake)
        try send(.data(data))
    }

    public func sendPCM(_ buffer: Data) throws {
        try send(.data(buffer))
    }

    public func finishAudio() throws {
        try send(.string(""))
    }

    public func nextResponse() async throws -> SonioxResponse {
        guard let socket else { throw SonioxClientError.notConnected }
        let message = try await socket.receive()
        let data: Data

        switch message {
        case .data(let payload):
            data = payload
        case .string(let payload):
            data = Data(payload.utf8)
        @unknown default:
            data = Data()
        }

        let response = try decoder.decode(SonioxResponse.self, from: data)
        if let error = response.errorMessage {
            throw SonioxClientError.server(error)
        }
        return response
    }

    public func disconnect() async {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }

    private func send(_ message: URLSessionWebSocketTask.Message) throws {
        guard let socket else { throw SonioxClientError.notConnected }
        socket.send(message) { error in
            if let error {
                assertionFailure("Soniox send failed: \(error.localizedDescription)")
            }
        }
    }
}

public actor TranscriptAssembler {
    private var lines: [TranscriptLine] = []
    private var currentText = ""
    private var unfinalizedText = ""
    private var currentSpeaker: TranscriptSpeaker
    private var segmentTimestamp = Date()

    public init(speaker: TranscriptSpeaker = .me) {
        self.currentSpeaker = speaker
    }

    public func setSpeaker(_ speaker: TranscriptSpeaker) {
        self.currentSpeaker = speaker
    }

    public func consume(_ response: SonioxResponse) -> TranscriptDocument {
        if !response.tokens.isEmpty {
            unfinalizedText = ""
        }

        for token in response.tokens {
            let text = token.text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            if token.isFinal {
                if currentText.isEmpty {
                    segmentTimestamp = Date()
                }
                currentText += text
            } else {
                unfinalizedText += text
            }
        }

        if response.endpoint {
            flush()
        }

        return TranscriptDocument(lines: lines)
    }

    public func flush() -> TranscriptDocument {
        let candidate = (currentText + unfinalizedText).trimmingCharacters(in: .whitespacesAndNewlines)
        if !candidate.isEmpty {
            lines.append(TranscriptLine(speaker: currentSpeaker, text: candidate, timestamp: segmentTimestamp))
        }
        currentText = ""
        unfinalizedText = ""
        segmentTimestamp = Date()
        return TranscriptDocument(lines: lines)
    }
}
