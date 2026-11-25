import Foundation
import Security

enum AccountKeychain {
    struct Failure: Error { let status: OSStatus }

    private static let sessionName = "slipsurge.supabase.session"
    private static let emailName = "slipsurge.supabase.email-verifier"

    static func read() throws -> AccountSession? { try read(AccountSession.self, named: sessionName) }
    static func write(_ session: AccountSession) throws { try write(session, named: sessionName) }
    static func remove() throws { try remove(named: sessionName) }
    static func emailAttempt() throws -> EmailAuthAttempt? { try read(EmailAuthAttempt.self, named: emailName) }
    static func storeEmailAttempt(_ attempt: EmailAuthAttempt) throws { try write(attempt, named: emailName) }
    static func clearEmailAttempt() throws { try remove(named: emailName) }

    private static func read<Value: Decodable>(_ type: Value.Type, named name: String) throws -> Value? {
        var query = identity(name)
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw Failure(status: status) }
        guard let data = result as? Data else { throw Failure(status: errSecDecode) }
        return try JSONDecoder().decode(type, from: data)
    }

    private static func write<Value: Encodable>(_ value: Value, named name: String) throws {
        let data = try JSONEncoder().encode(value)
        let key = identity(name)
        let status = SecItemUpdate(key as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw Failure(status: status) }
        var item = key
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        item[kSecValueData as String] = data
        let inserted = SecItemAdd(item as CFDictionary, nil)
        guard inserted == errSecSuccess else { throw Failure(status: inserted) }
    }

    private static func remove(named name: String) throws {
        let status = SecItemDelete(identity(name) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(status: status) }
    }

    private static func identity(_ name: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.slipsurge.ios.development",
            kSecAttrAccount as String: name
        ]
    }
}
