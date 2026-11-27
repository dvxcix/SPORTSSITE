import Foundation
import OSLog
import StoreKit

@MainActor
enum UltimateAppleSubscription {
    static let productID = "com.slipsurge.ios.ultimate.monthly"
    private static let log = Logger(subsystem: "com.slipsurge.ios", category: "StoreKit")

    enum PurchaseResult {
        case active, pending, cancelled, verificationPending
    }

    enum RestoreResult {
        case active, none, otherAccount, cancelled
    }

    enum PurchaseError: Error {
        case differentAccount
        case unverified
    }

    static func product() async throws -> Product? {
        try await Product.products(for: [productID]).first { product in
            product.id == productID && product.type == .autoRenewable &&
                product.subscription?.subscriptionPeriod.unit == .month &&
                product.subscription?.subscriptionPeriod.value == 1
        }
    }

    static func purchase(_ product: Product, account: AccountStore, userID: UUID) async throws -> PurchaseResult {
        guard product.id == productID, account.memberID == userID else { throw PurchaseError.differentAccount }
        switch try await product.purchase(options: [.appAccountToken(userID)]) {
        case .success(let result):
            do {
                let active = try await redeem(result, account: account, userID: userID)
                return active ? .active : .verificationPending
            } catch {
                report(error, action: "Purchase verification")
                return .verificationPending
            }
        case .pending: return .pending
        case .userCancelled: return .cancelled
        @unknown default: return .verificationPending
        }
    }

    static func restore(account: AccountStore, userID: UUID) async throws -> RestoreResult {
        guard account.memberID == userID else { throw PurchaseError.differentAccount }
        do {
            let current = try await restoreCurrentEntitlements(account: account, userID: userID)
            guard case .none = current else { return current }
            try await AppStore.sync()
            return try await restoreCurrentEntitlements(account: account, userID: userID)
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            report(error, action: "Restore")
            throw error
        }
    }

    private static func restoreCurrentEntitlements(account: AccountStore, userID: UUID) async throws -> RestoreResult {
        var foundOtherAccount = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, transaction.productID == productID else { continue }
            if transaction.appAccountToken != userID {
                foundOtherAccount = true
                continue
            }
            if try await redeem(result, account: account, userID: userID) { return .active }
        }
        return foundOtherAccount ? .otherAccount : .none
    }

    static func observe(account: AccountStore, userID: UUID) async {
        for await result in Transaction.unfinished {
            if Task.isCancelled { return }
            await recover(result, account: account, userID: userID)
        }
        for await result in Transaction.updates {
            if Task.isCancelled { return }
            await recover(result, account: account, userID: userID)
        }
    }

    private static func recover(_ result: VerificationResult<Transaction>, account: AccountStore, userID: UUID) async {
        guard case .verified(let transaction) = result, transaction.productID == productID,
              transaction.appAccountToken == userID else { return }
        do {
            _ = try await redeem(result, account: account, userID: userID)
        } catch is CancellationError {
            return
        } catch {
            report(error, action: "Transaction recovery")
        }
    }

    private static func report(_ error: any Error, action: String) {
        if let response = error as? SlipSurgeHTTP.Status {
            log.error("\(action, privacy: .public) returned HTTP \(response.code, privacy: .public)")
        } else {
            let failure = error as NSError
            log.error("\(action, privacy: .public) failed with \(failure.domain, privacy: .public) \(failure.code, privacy: .public)")
        }
    }

    private static func redeem(_ result: VerificationResult<Transaction>, account: AccountStore, userID: UUID) async throws -> Bool {
        guard case .verified(let transaction) = result, transaction.productID == productID else {
            throw PurchaseError.unverified
        }
        guard transaction.appAccountToken == userID, account.memberID == userID else {
            throw PurchaseError.differentAccount
        }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/account/storekit")
        request.httpMethod = "POST"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["signedTransaction": result.jwsRepresentation])
        struct Entitlement: Decodable { let active: Bool }
        let data = try await SlipSurgeHTTP.send(request)
        let granted = try JSONDecoder().decode(Entitlement.self, from: data)
        guard account.memberID == userID else { throw PurchaseError.differentAccount }
        await transaction.finish()
        await account.refreshMembershipAccess()
        return granted.active && account.confirmedAccessTier == "ultimate"
    }
}
