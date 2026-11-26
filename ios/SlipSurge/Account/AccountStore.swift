import AuthenticationServices
import Foundation
import Observation

@MainActor
@Observable
final class AccountStore {
    struct ProfileIdentity: Decodable {
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingStyle: String?
        let avatarRingColor: String?

        var name: String { displayName ?? username }
    }

    private struct MembershipAccess: Decodable {
        let id: UUID
        let accessTier: String
        let role: String?
    }

    private let api = AccountAPI()
    let postReactions = FeedReactionStore()
    private var session: AccountSession?
    private var rotatedSession: AccountSession?
    private var pendingVerification: AccountSession?
    private var recoverySession: AccountSession?
    @ObservationIgnored private var renewal: Task<AccountSession, Error>?
    private(set) var isBusy = false
    private var isSigningOut = false
    private(set) var notice: String?
    private(set) var providersAvailable = false
    private(set) var onboardingComplete = false
    private(set) var profileIdentity: ProfileIdentity?
    private var membershipAccess: MembershipAccess?
    private var restored = false

    var isConfigured: Bool { api.isConfigured }
    var didRestoreAccount: Bool { restored || !isConfigured }
    var user: AccountSession.User? { session?.user }
    var memberID: UUID? { onboardingComplete && !isSigningOut ? user?.id : nil }
    var confirmedAccessTier: String? {
        guard let memberID, membershipAccess?.id == memberID else { return nil }
        return membershipAccess?.accessTier
    }
    var showsUltimateOffer: Bool {
        guard !needsVerification, !needsNewPassword else { return false }
        guard let memberID else { return didRestoreAccount && user == nil }
        guard let membershipAccess, membershipAccess.id == memberID else { return false }
        return membershipAccess.role != "admin" && membershipAccess.accessTier != "ultimate"
    }
    var needsVerification: Bool { pendingVerification != nil }
    var needsNewPassword: Bool { recoverySession != nil }
    var recoveryNeedsAuthenticator: Bool {
        recoverySession.map { $0.user.hasVerifiedFactor && !$0.isMFAAuthenticated } ?? false
    }

    func registrationAvailability() async throws -> AccountAPI.RegistrationAvailability {
        try await api.registrationAvailability()
    }

    func refreshProfileIdentity() async {
        guard let id = memberID else { profileIdentity = nil; return }
        struct Settings: Decodable { let profile: ProfileIdentity }
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/account/settings", account: self, userID: id, timeout: 25)
            let response = try JSONDecoder().decode(Settings.self, from: data)
            if memberID == id, !Task.isCancelled { profileIdentity = response.profile }
        } catch { }
    }

    func refreshMembershipAccess() async {
        guard let id = memberID else { membershipAccess = nil; return }
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/account", account: self, userID: id)
            let result = try JSONDecoder().decode(MembershipAccess.self, from: data)
            if !Task.isCancelled, memberID == id, result.id == id { membershipAccess = result }
        } catch {
            if !Task.isCancelled, memberID == id { membershipAccess = nil }
        }
    }

    func beginEmail(_ registration: AccountAPI.Registration) async -> Bool {
        guard !isBusy, isConfigured, session == nil, pendingVerification == nil, recoverySession == nil else { return false }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            guard try await registrationAvailability().open else {
                notice = "Registration is closed. Existing members can still sign in."
                return false
            }
            let attempt = try EmailAuthAttempt(.registration)
            try AccountKeychain.storeEmailAttempt(attempt)
            if let active = try await api.register(registration, attempt: attempt) {
                try AccountKeychain.clearEmailAttempt()
                try await accept(active)
            }
            return true
        } catch {
            notice = message(for: error, fallback: "Account setup couldn’t start. Check your details and try again.")
            return false
        }
    }

    func beginRecovery(email: String) async -> Bool {
        guard !isBusy, isConfigured, session == nil, pendingVerification == nil, recoverySession == nil else { return false }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            let attempt = try EmailAuthAttempt(.recovery)
            try AccountKeychain.storeEmailAttempt(attempt)
            try await api.recover(email: email, attempt: attempt)
            return true
        } catch {
            notice = message(for: error, fallback: "A reset link couldn’t be requested. Try again.")
            return false
        }
    }

    func openEmail(_ url: URL) async {
        guard url.scheme == EmailAuthAttempt.scheme, !isBusy, session == nil, pendingVerification == nil,
              recoverySession == nil else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            guard let attempt = try AccountKeychain.emailAttempt() else {
                notice = "Open the link on the device that requested it."
                return
            }
            guard let code = try attempt.code(from: url) else { return }
            let updated = try await api.redeem(code, attempt: attempt)
            try AccountKeychain.clearEmailAttempt()
            switch attempt.purpose {
            case .registration:
                try await accept(updated)
            case .recovery:
                let verified = try await api.validatedUser(updated)
                recoverySession = AccountSession(accessToken: updated.accessToken, refreshToken: updated.refreshToken,
                    expiresAt: updated.expiresAt, user: verified)
                notice = nil
            }
        } catch {
            notice = "This link couldn’t be verified. Request a fresh link on this device."
        }
    }

    func finishRecovery(password: String, code: String) async -> Bool {
        guard !isBusy, let original = recoverySession else { return false }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            guard !original.needsRefresh else {
                cancelRecovery()
                notice = "The recovery session expired. Request a fresh link."
                return false
            }
            let session: AccountSession
            if original.user.hasVerifiedFactor && !original.isMFAAuthenticated {
                guard let factor = original.user.verifiedTOTP, code.count == 6 else {
                    notice = "Enter your six-digit authenticator code."
                    return false
                }
                session = try await api.verifyTOTP(code, factorID: factor, session: original)
                recoverySession = session
            } else {
                session = original
            }
            try await api.updatePassword(password, session: session)
            recoverySession = nil
            try await accept(session)
            return true
        } catch {
            notice = "The password update couldn’t be confirmed. Check your details and try again."
            return false
        }
    }

    func cancelRecovery() {
        guard let recoverySession else { return }
        self.recoverySession = nil
        Task { try? await api.signOut(recoverySession) }
    }

    func onboardingData() async throws -> NativeOnboarding.Initial {
        let data = try await setupRequest()
        return try JSONDecoder().decode(NativeOnboarding.Initial.self, from: data)
    }

    func finishOnboarding(_ draft: NativeOnboarding.Draft) async throws {
        guard !isBusy else { throw URLError(.resourceUnavailable) }
        isBusy = true
        defer { isBusy = false }
        let data = try await setupRequest(body: JSONEncoder().encode(draft))
        struct Confirmation: Decodable { let ok: Bool }
        guard try JSONDecoder().decode(Confirmation.self, from: data).ok, let session else {
            throw URLError(.cannotParseResponse)
        }
        try await accept(session)
        guard onboardingComplete else { throw URLError(.cannotParseResponse) }
    }

    func uploadSetupPhoto(_ photo: NativeMediaUpload.Photo, kind: NativeMediaUpload.Kind) async throws -> URL {
        guard (kind == .avatars || kind == .banners), !isBusy, pendingVerification == nil,
              let session else { throw URLError(.userAuthenticationRequired) }
        isBusy = true
        defer { isBusy = false }
        let current = session.needsRefresh ? try await refreshSavedSession(session) : session
        self.session = current
        let id = current.user.id
        let url = try await NativeMediaUpload.send(photo, kind: kind, token: current.accessToken, userID: id)
        guard self.session?.user.id == id, !isSigningOut else { throw URLError(.userAuthenticationRequired) }
        return url
    }

    private func setupRequest(body: Data? = nil) async throws -> Data {
        guard let session, pendingVerification == nil else { throw URLError(.userAuthenticationRequired) }
        let current = session.needsRefresh ? try await refreshSavedSession(session) : session
        self.session = current
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/account/onboarding")
        request.setValue("Bearer \(current.accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data = try await SlipSurgeHTTP.send(request)
        guard self.session?.user.id == current.user.id, !isSigningOut else { throw URLError(.userAuthenticationRequired) }
        return data
    }

    func restore() async {
        guard !restored, isConfigured, !isBusy, recoverySession == nil else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            guard let saved = try AccountKeychain.read() else {
                restored = true
                return
            }
            let current = saved.needsRefresh ? try await refreshSavedSession(saved) : saved
            try await accept(current)
        } catch let error as SlipSurgeHTTP.Status where Self.isInvalidSession(error) {
            clearExpiredSession()
        } catch {
            notice = "Your saved session could not be opened. Check your connection or unlock your device and retry."
        }
    }

    func signIn(email: String, password: String) async {
        guard !isBusy, session == nil, pendingVerification == nil else { return }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            let updated = try await api.signIn(email: email, password: password)
            try await accept(updated)
        } catch let error as SlipSurgeHTTP.Status where Self.isInvalidSession(error) {
            notice = "Check your email and password, then try again."
        } catch {
            notice = message(for: error, fallback: "Sign-in could not finish. Check your connection and try again.")
        }
    }

    func checkProviders() async {
        if isConfigured { providersAvailable = await api.providersAvailable() }
    }

    func signIn(provider: SignInProvider, registering: Bool = false, authenticate: @MainActor (URL) async throws -> URL) async {
        guard !isBusy, isConfigured, providersAvailable, session == nil, pendingVerification == nil else { return }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            if registering, try await !registrationAvailability().open {
                notice = "Registration is closed. Existing members can still sign in."
                return
            }
            let attempt = try ProviderSignIn(provider: provider)
            let callback = try await authenticate(attempt.url)
            let handoff = try attempt.handoff(from: callback)
            try await accept(api.exchange(handoff: handoff, attempt: attempt))
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            // Cancellation returns to the unchanged account screen.
        } catch let error as ProviderSignIn.CallbackError where error.code == "whop_no_access" {
            notice = "That Whop account doesn’t have SlipSurge access."
        } catch let error as ProviderSignIn.CallbackError where error.code == "email-required" {
            notice = "This provider account needs a verified email address to sign in."
        } catch {
            notice = "Sign-in with \(provider.title) could not finish. Try again."
        }
    }

    func verify(_ code: String) async {
        guard !isBusy, let pendingVerification, let factor = pendingVerification.user.verifiedTOTP else { return }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            let current = pendingVerification.needsRefresh ? try await api.refresh(pendingVerification) : pendingVerification
            self.pendingVerification = current
            let verified = try await api.verifyTOTP(code, factorID: factor, session: current)
            try await accept(verified)
        } catch {
            notice = message(for: error, fallback: "That code could not be verified. Check your authenticator and try again.")
        }
    }

    func cancelVerification() async {
        guard !isBusy, let pendingVerification else { return }
        self.pendingVerification = nil
        notice = nil
        try? await api.signOut(pendingVerification)
    }

    func accessToken(for userID: UUID, replacing rejectedToken: String? = nil) async throws -> String {
        guard memberID == userID, let session else { throw URLError(.userAuthenticationRequired) }
        if let renewal { return try await renewal.value.accessToken }
        guard rotatedSession != nil || session.needsRefresh || rejectedToken == session.accessToken else { return session.accessToken }

        let task = Task { @MainActor in
            do {
                let updated: AccountSession
                if let rotatedSession, !rotatedSession.needsRefresh {
                    updated = rotatedSession
                } else {
                    updated = try await refreshSavedSession(rotatedSession ?? session)
                }
                try await accept(updated)
                guard memberID == userID else { throw URLError(.userAuthenticationRequired) }
                return updated
            } catch let error as SlipSurgeHTTP.Status where Self.isInvalidSession(error) {
                clearExpiredSession()
                throw error
            }
        }
        renewal = task
        defer { renewal = nil }
        return try await task.value.accessToken
    }

    func signOut() async {
        guard !isBusy, let original = session else { return }
        isSigningOut = true
        isBusy = true
        notice = nil
        defer {
            isBusy = false
            isSigningOut = false
        }

        do {
            if let renewal { _ = try? await renewal.value }
            let latest = rotatedSession ?? session ?? pendingVerification ?? original
            try AccountKeychain.remove()
            postReactions.reset()
            profileIdentity = nil
            session = nil
            rotatedSession = nil
            pendingVerification = nil
            onboardingComplete = false
            do {
                try await api.signOut(latest)
            } catch {
                notice = "Signed out on this device. The server could not confirm session revocation."
            }
        } catch {
            notice = "Your saved sign-in could not be removed. Try signing out again."
        }
    }

    func recheckOnboarding() async {
        guard !isBusy, let session, !onboardingComplete else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let current = session.needsRefresh ? try await refreshSavedSession(session) : session
            try await accept(current)
        } catch let error as SlipSurgeHTTP.Status where Self.isInvalidSession(error) {
            clearExpiredSession()
        } catch {
            notice = "Account setup could not be checked. Try again."
        }
    }

    func withSecuritySession<Value>(for userID: UUID, action: (AccountSession) async throws -> Value) async throws -> Value {
        guard !isBusy, memberID == userID else { throw URLError(.userAuthenticationRequired) }
        isBusy = true
        defer { isBusy = false }
        _ = try await accessToken(for: userID)
        guard let session, memberID == userID else { throw URLError(.userAuthenticationRequired) }
        let result = try await action(session)
        guard memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return result
    }

    func setupAuthenticator(for userID: UUID) async throws -> AuthenticatorEnrollment {
        try await withSecuritySession(for: userID) { try await api.enrollAuthenticator(session: $0) }
    }

    func verifyAuthenticator(_ code: String, id: UUID, for userID: UUID) async throws {
        try await withSecuritySession(for: userID) { current in
            let verified = try await api.verifyTOTP(code, factorID: id, session: current)
            guard memberID == userID else { throw URLError(.userAuthenticationRequired) }
            try AccountKeychain.write(verified)
            session = verified
            rotatedSession = nil
        }
    }

    private func refreshSavedSession(_ previous: AccountSession) async throws -> AccountSession {
        let rotated = try await api.refresh(previous)
        // Keep the new refresh token if a later profile or onboarding read fails.
        try AccountKeychain.write(rotated)
        rotatedSession = rotated
        return rotated
    }

    private func accept(_ updated: AccountSession) async throws {
        let verified = try await api.validatedUser(updated)
        if verified.hasVerifiedFactor && !updated.isMFAAuthenticated {
            try AccountKeychain.remove()
            postReactions.reset()
            profileIdentity = nil
            session = nil
            rotatedSession = nil
            onboardingComplete = false
            restored = true
            guard verified.verifiedTOTP != nil else { throw AccountAPI.Failure.additionalVerificationRequired }
            pendingVerification = AccountSession(
                accessToken: updated.accessToken, refreshToken: updated.refreshToken,
                expiresAt: updated.expiresAt, user: verified
            )
            notice = nil
            return
        }
        let completed = try await api.onboardingComplete(updated)
        let validated = AccountSession(accessToken: updated.accessToken, refreshToken: updated.refreshToken,
            expiresAt: updated.expiresAt, user: verified)
        try AccountKeychain.write(validated)
        onboardingComplete = completed
        session = validated
        rotatedSession = nil
        pendingVerification = nil
        restored = true
        notice = nil
    }

    private func clearExpiredSession() {
        postReactions.reset()
        profileIdentity = nil
        session = nil
        rotatedSession = nil
        pendingVerification = nil
        onboardingComplete = false
        do {
            try AccountKeychain.remove()
            restored = true
            notice = "Sign in again to continue."
        } catch {
            notice = "The expired session could not be cleared. Unlock your device and try again."
        }
    }

    private static func isInvalidSession(_ error: SlipSurgeHTTP.Status) -> Bool {
        [400, 401, 403].contains(error.code)
    }

    private func message(for error: Error, fallback: String) -> String {
        if (error as? SlipSurgeHTTP.Status)?.code == 429 { return "Too many attempts. Wait a moment and try again." }
        if error is AccountAPI.Failure { return "Use the website to complete additional security verification." }
        return fallback
    }
}
