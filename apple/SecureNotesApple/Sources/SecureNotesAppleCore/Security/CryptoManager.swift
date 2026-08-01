import Crypto
import Foundation

public enum CryptoManagerError: Error, Equatable {
    case invalidBase64
    case invalidCiphertext
    case invalidPayload
}

public enum CryptoManager {
    public static let pbkdf2Iterations = 100_000
    public static let saltLength = 16
    public static let ivLength = 12
    public static let keyLength = 32
    private static let gcmTagLength = 16

    public static func encrypt(note: SecureNote, password: String) throws -> EncryptedNotePayload {
        let data = try JSONEncoder.secureNotes.encode(note)
        return try encrypt(data: data, password: password)
    }

    public static func decrypt(payload: EncryptedNotePayload, password: String) throws -> SecureNote {
        let plaintext = try decrypt(payload: payload, password: password)
        return try JSONDecoder.secureNotes.decode(SecureNote.self, from: plaintext)
    }

    public static func encrypt(data: Data, password: String) throws -> EncryptedNotePayload {
        let salt = randomBytes(count: saltLength)
        let nonceData = randomBytes(count: ivLength)
        let key = SymmetricKey(data: try deriveKey(password: password, salt: salt))
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let sealed = try AES.GCM.seal(data, using: key, nonce: nonce)

        return EncryptedNotePayload(
            ciphertext: Data(sealed.ciphertext + sealed.tag).base64EncodedString(),
            iv: nonceData.base64EncodedString(),
            salt: salt.base64EncodedString(),
            version: 1
        )
    }

    public static func decrypt(payload: EncryptedNotePayload, password: String) throws -> Data {
        guard
            let salt = Data(base64Encoded: payload.salt),
            let nonceData = Data(base64Encoded: payload.iv),
            let sealedPayload = Data(base64Encoded: payload.ciphertext),
            sealedPayload.count > gcmTagLength
        else {
            throw CryptoManagerError.invalidBase64
        }

        let ciphertext = sealedPayload.prefix(sealedPayload.count - gcmTagLength)
        let tag = sealedPayload.suffix(gcmTagLength)
        let key = SymmetricKey(data: try deriveKey(password: password, salt: salt))
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag)
        return try AES.GCM.open(box, using: key)
    }

    public static func deriveKey(password: String, salt: Data) throws -> Data {
        let passwordData = Data(password.utf8)
        let passwordKey = SymmetricKey(data: passwordData)
        let blockCount = Int(ceil(Double(keyLength) / Double(SHA256.byteCount)))
        var derived = Data()
        derived.reserveCapacity(keyLength)

        for blockIndex in 1...blockCount {
            var blockInput = salt
            blockInput.append(blockIndex.bigEndianBytes)

            var u = Data(HMAC<SHA256>.authenticationCode(for: blockInput, using: passwordKey))
            var t = u

            if pbkdf2Iterations > 1 {
                for _ in 2...pbkdf2Iterations {
                    u = Data(HMAC<SHA256>.authenticationCode(for: u, using: passwordKey))
                    xor(into: &t, with: u)
                }
            }

            derived.append(t)
        }

        return derived.prefix(keyLength)
    }

    private static func randomBytes(count: Int) -> Data {
        Data((0..<count).map { _ in UInt8.random(in: .min ... .max) })
    }

    private static func xor(into lhs: inout Data, with rhs: Data) {
        for index in lhs.indices {
            lhs[index] ^= rhs[index]
        }
    }
}

private extension Int {
    var bigEndianBytes: Data {
        var value = UInt32(self).bigEndian
        return withUnsafeBytes(of: &value) { Data($0) }
    }
}
