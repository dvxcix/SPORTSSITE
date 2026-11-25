import Foundation
import Observation

@MainActor
@Observable
final class AccountStore {
    private let api = AccountAPI()
    private var session: AccountSession?
    private var rotatedSession: AccountSession?
    private var pendingVerification: AccountSession?
    @ObservationIgnored private var renewal: Task<AccountSession, Error>?
    private(set) var isBusy = false
    private(set) var notice: String?
    private(set) var onboardingComplete = false
    private var restored = false

    var isConfigured: Bool { api.isConfigured }
    var user: AccountSession.User? { session?.user }
    var memberID: UUID? { onboardingComplete ? user?.id : nil }
    var needsVerification: Bool { pendingVerification != nil }

    func restore() async {
        guard !restored, isConfigured, !isBusy else { return }
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
        isBusy = true
        notice = nil
        defer { isBusy = false }

        do {
            if let renewal { _ = try? await renewal.value }
            let latest = rotatedSession ?? session ?? pendingVerification ?? original
            try AccountKeychain.remove()
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
        try AccountKeychain.write(updated)
        onboardingComplete = completed
        session = updated
        rotatedSession = nil
        pendingVerification = nil
        restored = true
        notice = nil
    }

    private func clearExpiredSession() {
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
