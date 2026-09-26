import Foundation
#if canImport(ScreenCaptureKit) && canImport(AVFoundation)
import ScreenCaptureKit
import AVFoundation

public enum AppleSystemAudioCaptureError: Error, Equatable {
    case permissionDenied
    case noShareableContent
    case captureFailed(String)
}

/// Native Apple System Audio Capture service utilizing ScreenCaptureKit (macOS 13.0+)
/// Captures high-fidelity system audio output with `capturesAudio = true`
/// and delivers 16kHz PCM data for transcription and diarization.
public final class AppleSystemAudioCaptureService: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private var stream: SCStream?
    private var onBuffer: (@Sendable (Data) -> Void)?
    private let targetSampleRate: Double = 16_000.0

    public override init() {
        super.init()
    }

    /// Starts capturing live system audio using ScreenCaptureKit
    public func start(onBuffer: @escaping @Sendable (Data) -> Void) async throws {
        self.onBuffer = onBuffer

        // Query available content to share
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw AppleSystemAudioCaptureError.permissionDenied
        }

        guard let display = content.displays.first else {
            throw AppleSystemAudioCaptureError.noShareableContent
        }

        // Exclude our own application from the capture so audio does not feedback loop
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

        let streamConfig = SCStreamConfiguration()
        // Audio capture enabled
        streamConfig.capturesAudio = true
        streamConfig.sampleRate = Int(targetSampleRate)
        streamConfig.channelCount = 1 // mono
        streamConfig.excludesCurrentProcessAudio = true // Prevents self-feedback

        // Minimize video overhead since we only need the audio stream
        streamConfig.width = 2
        streamConfig.height = 2
        streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let newStream = SCStream(filter: filter, configuration: streamConfig, delegate: self)
        
        do {
            try newStream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "com.mata.securenotes.systemaudio"))
            try await newStream.startCapture()
            self.stream = newStream
        } catch {
            throw AppleSystemAudioCaptureError.captureFailed(error.localizedDescription)
        }
    }

    public func stop() async {
        if let stream = self.stream {
            try? await stream.stopCapture()
            self.stream = nil
        }
        self.onBuffer = nil
    }

    // MARK: - SCStreamOutput
    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, let onBuffer = self.onBuffer else { return }

        // Extract PCM audio data from CMSampleBuffer
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
        let length = CMBlockBufferGetDataLength(blockBuffer)
        guard length > 0 else { return }

        var data = Data(count: length)
        data.withUnsafeMutableBytes { (bytes: UnsafeMutableRawBufferPointer) in
            if let baseAddress = bytes.baseAddress {
                CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
            }
        }

        // Convert audio samples if needed (e.g. Float32 to Int16 PCM)
        if let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
           let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)?.pointee {
            if asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0 {
                // Convert 32-bit float to 16-bit PCM
                let floatCount = length / MemoryLayout<Float32>.size
                var pcmData = Data(capacity: floatCount * MemoryLayout<Int16>.size)
                data.withUnsafeBytes { (rawFloats: UnsafeRawBufferPointer) in
                    let floats = rawFloats.bindMemory(to: Float32.self)
                    for sample in floats {
                        let clamped = max(-1.0, min(1.0, sample))
                        var int16 = Int16(clamped * Float(Int16.max)).littleEndian
                        withUnsafeBytes(of: &int16) { pcmData.append(contentsOf: $0) }
                    }
                }
                onBuffer(pcmData)
                return
            }
        }

        onBuffer(data)
    }

    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        self.stream = nil
    }
}
#endif
