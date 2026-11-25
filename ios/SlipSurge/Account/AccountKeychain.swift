import Foundation
import Security

enum AccountKeychain {
    struct Failure: Error { let status: OSStatus }

    static func read() throws -> AccountSession? {
        var query = identity
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw Failure(status: status) }
        guard let data = result as? Data else { throw Failure(status: errSecDecode) }
        return try JSONDecoder().decode(AccountSession.self, from: data)
    }

    static func write(_ session: AccountSession) throws {
        let data = try JSONEncoder().encode(session)
        let status = SecItemUpdate(identity as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw Failure(status: status) }
        var item = identity
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        item[kSecValueData as String] = data
        let inserted = SecItemAdd(item as CFDictionary, nil)
        guard inserted == errSecSuccess else { throw Failure(status: inserted) }
    }

    static func remove() throws {
        let status = SecItemDelete(identity as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(status: status) }
    }

    private static var identity: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.slipsurge.ios.development",
            kSecAttrAccount as String: "slipsurge.supabase.session"
        ]
    }
}
