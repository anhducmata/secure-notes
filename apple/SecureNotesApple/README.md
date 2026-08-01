# SecureNotesApple

Native Apple client scaffold for `secure-notes`, written in Swift.

## What's included

- `SecureNotesAppleCore` Swift package with:
  - encrypted note models and file storage
  - PBKDF2 + AES-GCM note encryption compatible with the web app's design
  - Soniox WebSocket client for streaming transcription
  - background transcription job persistence
  - Apple-only helpers for `BackgroundTasks`, `AVAudioEngine`, and SwiftUI

## Open in Xcode

1. Open `/home/runner/work/secure-notes/secure-notes/apple/SecureNotesApple/Package.swift` in Xcode.
2. Create an iOS or macOS app target in Xcode.
3. Add the `SecureNotesAppleCore` package to that target.
4. Set the root view to `SecureNotesAppleRootView(model:)`.

## Required Apple capabilities

- Background Modes:
  - Audio
  - Background processing
- Info.plist keys:
  - `NSMicrophoneUsageDescription`
  - `BGTaskSchedulerPermittedIdentifiers` with `com.mata.securenotes.transcription`

## Local storage

The package persists encrypted notes and queued transcription jobs to JSON files. Wire those files to your app container, for example:

- `Application Support/notes.enc.json`
- `Application Support/transcription-jobs.json`

## Validation

Run from this directory:

```bash
swift test
```
