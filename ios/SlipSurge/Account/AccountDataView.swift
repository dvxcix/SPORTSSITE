import SwiftUI
import UniformTypeIdentifiers

struct AccountDataView: View {
    let account: AccountStore
    let userID: UUID
    let hasPaidPlan: Bool

    @Environment(\.colorScheme) private var scheme
    @State private var history: [Request]?
    @State private var failure: String?
    @State private var busy = false
    @State private var presentingExport = false
    @State private var export: ExportDocument?
    @State private var prepare = false

    private static let path = "/api/account/data-export"

    private struct Request: Decodable {
        let id: UUID
        let status: String
        let expires_at: String?

        var expired: Bool { expires_at.flatMap(SidelineBoard.timestamp).map { $0 <= .now } ?? false }
    }

    private struct ExportDocument: FileDocument {
        static let readableContentTypes: [UTType] = [.json]
        let data: Data

        init(data: Data) { self.data = data }

        init(configuration: ReadConfiguration) throws {
            guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
            self.data = data
        }

        func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { .init(regularFileWithContents: data) }
    }

    var body: some View {
        Form {
            Section {
                if let history {
                    if let single = history.first(where: { !$0.expired && ["ready", "delivered"].contains($0.status) }) {
                        Button("Save JSON export", systemImage: "square.and.arrow.down") { Task { await download(single.id) } }
                        if let expiration = single.expires_at.flatMap(SidelineBoard.timestamp) {
                            LabeledContent("Available until", value: expiration.formatted(date: .abbreviated, time: .omitted))
                        }
                    } else if let single = history.first, ["queued", "processing"].contains(single.status) {
                        Label("Preparing export", systemImage: "clock")
                        Button("Check status") { Task { await load() } }
                    } else {
                        Button("Prepare data export", systemImage: "archivebox") { prepare = true }
                    }
                } else if failure == nil {
                    ProgressView("Checking export status")
                } else {
                    Button("Retry") { Task { await load() } }
                }
            } header: { Text("Export") }
            footer: { Text("Save a private copy of your SlipSurge account data to Files.") }
            .listRowBackground(Brand.surface(for: scheme))

            Section {
                NavigationLink {
                    AccountDeletionView(account: account, userID: userID, hasPaidPlan: hasPaidPlan)
                } label: { Label("Delete account", systemImage: "trash") }
            }.listRowBackground(Brand.surface(for: scheme))

            if let failure { Label(failure, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Your data")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(busy)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Prepare your account export?", isPresented: $prepare, titleVisibility: .visible) {
            Button("Prepare data export") { Task { await create() } }
        }
        .fileExporter(isPresented: $presentingExport, document: export, contentType: .json,
            defaultFilename: "SlipSurge account data.json") { result in
                if case .failure = result { failure = "The file couldn’t be saved. Try again." }
            }
        .onChange(of: presentingExport) { _, isPresented in
            if !isPresented { export = nil }
        }
    }

    private func load() async {
        struct Result: Decodable { let requests: [Request] }
        do {
            let data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
            history = try JSONDecoder().decode(Result.self, from: data).requests
            failure = nil
        } catch { if !Task.isCancelled { failure = "Export status couldn’t load." } }
    }

    private func create() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await AccountPrivacyRequest.send(Self.path, method: "POST", account: account, userID: userID)
            await load()
        } catch let error as SlipSurgeHTTP.Status where error.code == 429 {
            failure = "Export limit reached. Try again later."
        } catch { failure = "Your export couldn’t be prepared." }
    }

    private func download(_ id: UUID) async {
        guard !busy else { return }
        busy = true
        failure = nil
        defer { busy = false }
        do {
            let data = try await SlipSurgeHTTP.memberData("\(Self.path)/\(id.uuidString.lowercased())/download", account: account, userID: userID)
            export = ExportDocument(data: data)
            presentingExport = true
        } catch let error as SlipSurgeHTTP.Status where error.code == 410 {
            await load()
            failure = "That export expired. Prepare a new copy."
        } catch { failure = "The export couldn’t be downloaded." }
    }
}

enum AccountPrivacyRequest {
    @MainActor
    static func send(_ path: String, method: String, account: AccountStore, userID: UUID, body: Data? = nil) async throws -> Data {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path)
        request.httpMethod = method
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        let data = try await SlipSurgeHTTP.send(request)
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return data
    }
}
