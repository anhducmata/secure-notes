import Foundation

public enum CryptoManagerError: Error, Equatable {
    case invalidBase64
    case invalidCiphertext
    case invalidPayload
    case unsupportedPlatform
}

#if canImport(CryptoKit) && canImport(CommonCrypto)
import CommonCrypto
import CryptoKit

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
        var derivedKey = Data(repeating: 0, count: keyLength)
        let status = derivedKey.withUnsafeMutableBytes { derivedBytes in
            salt.withUnsafeBytes { saltBytes in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    password,
                    password.utf8.count,
                    saltBytes.bindMemory(to: UInt8.self).baseAddress,
                    salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                    UInt32(pbkdf2Iterations),
                    derivedBytes.bindMemory(to: UInt8.self).baseAddress,
                    keyLength
                )
            }
        }

        guard status == kCCSuccess else {
            throw CryptoManagerError.invalidPayload
        }

        return derivedKey
    }

    private static func randomBytes(count: Int) -> Data {
        Data((0..<count).map { _ in UInt8.random(in: .min ... .max) })
    }
}
#else
public enum CryptoManager {
    public static let pbkdf2Iterations = 100_000
    public static let saltLength = 16
    public static let ivLength = 12
    public static let keyLength = 32

    public static func encrypt(note: SecureNote, password: String) throws -> EncryptedNotePayload {
        throw CryptoManagerError.unsupportedPlatform
    }

    public static func decrypt(payload: EncryptedNotePayload, password: String) throws -> SecureNote {
        throw CryptoManagerError.unsupportedPlatform
    }

    public static func encrypt(data: Data, password: String) throws -> EncryptedNotePayload {
        throw CryptoManagerError.unsupportedPlatform
    }

    public static func decrypt(payload: EncryptedNotePayload, password: String) throws -> Data {
        throw CryptoManagerError.unsupportedPlatform
    }

    public static func deriveKey(password: String, salt: Data) throws -> Data {
        throw CryptoManagerError.unsupportedPlatform
    }
}
#endif
