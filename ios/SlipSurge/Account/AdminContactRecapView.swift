import SwiftUI

struct AdminContactRecapView: View {
    private enum JobStatus: String, Decodable {
        case queued, running, retrying, completed, failed, expired
        var active: Bool { self == .queued || self == .running || self == .retrying }
    }

    private struct Job: Decodable, Identifiable {
        let id: UUID
        let recapDate: String
        let kind: String
        let format: String
        let aspect: String
        let status: JobStatus
        let progress: Int
        let stage: String
        let byteSize: Int64?
        let attemptCount: Int
        let error: String?
        let expiresAt: String

        var title: String { kind == "near" ? "Near Home Run Flight" : "Home Run Flight" }
        var downloadable: Bool {
            status == .completed && SidelineBoard.timestamp(expiresAt).map { $0 > Date.now } == true
        }
    }

    private struct Queue: Decodable { let paused: Bool; let jobs: [Job] }
    private struct Download: Decodable { let downloadUrl: URL; let filename: String }
    private struct ExportFile: Identifiable { let url: URL; var id: URL { url } }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var queue: Queue?
    @State private var error: (any Error)?
    @State private var refreshSequence = 0
    @State private var revision = 0
    @State private var downloading: UUID?
    @State private var exportFile: ExportFile?
    @State private var exportDirectory: URL?
    @State private var downloadFailed = false

    private static let path = "/api/mobile/admin/contact-recap"
    private static let storageHost = "hkldweedwnxartkfhror.supabase.co"
    private var accent: Color { Brand.accent(for: scheme) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let queue {
                    if queue.paused {
                        ResearchToolCard(color: .orange) { Label("Off-season pause", systemImage: "pause.circle").font(.headline) } content: {
                            Text("New MLB exports are paused. Existing exports can be downloaded until they expire.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Text("Export queue").font(.headline).accessibilityAddTraits(.isHeader)
                    if queue.jobs.isEmpty {
                        ContentUnavailableView("No exports", systemImage: "film.stack")
                    }
                    ForEach(queue.jobs) { job in jobRow(job) }
                    if error != nil {
                        ResearchToolMessage(title: "Export queue couldn’t refresh", error: error) { revision += 1 }
                    }
                } else {
                    ResearchToolMessage(title: "Export queue couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Daily Contact Recap")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refresh exports", systemImage: "arrow.clockwise") { revision += 1 }
            }
        }
        .refreshable { await load() }
        .task(id: revision) { await load() }
        .task(id: scenePhase == .active && queue?.jobs.contains(where: { $0.status.active }) == true) {
            guard scenePhase == .active, queue?.jobs.contains(where: { $0.status.active }) == true else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                await load()
            }
        }
        .sheet(item: $exportFile, onDismiss: removeExport) { file in
            VStack(spacing: 14) {
                Image(systemName: "film").font(.largeTitle).foregroundStyle(accent).accessibilityHidden(true)
                Text(file.url.lastPathComponent).font(.headline).multilineTextAlignment(.center)
                ShareLink(item: file.url) {
                    Label("Share or save export", systemImage: "square.and.arrow.up")
                }.buttonStyle(SlipSurgePrimaryButtonStyle())
            }.padding(20).presentationDetents([.medium]).presentationDragIndicator(.visible)
        }
        .alert("Export couldn’t download", isPresented: $downloadFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("An export may expire while you are viewing the queue. Refresh the queue and try again.")
        }
    }

    private func jobRow(_ job: Job) -> some View {
        let color: Color = job.status == .failed ? .red : job.kind == "near" ? .orange : accent
        return ResearchToolCard(color: color) {
            HStack(alignment: .top, spacing: 8) {
                Label(job.title, systemImage: job.kind == "near" ? "scope" : "film").font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(job.status.rawValue.capitalized).foregroundStyle(color)
                    .font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 5)
                    .background(color.opacity(0.12), in: .capsule)
            }
        } content: {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(job.recapDate) · \(job.format.uppercased()) · \(job.aspect.capitalized)").font(.caption).foregroundStyle(.secondary)
                if job.status.active {
                    ProgressView(value: Double(job.progress), total: 100) {
                        Text(job.stage)
                    } currentValueLabel: {
                        Text("\(job.progress)%")
                    }.font(.caption).tint(color)
                } else {
                    Text(job.error ?? job.stage).font(.footnote).foregroundStyle(.secondary)
                }
                let details = [job.byteSize.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) },
                               job.attemptCount > 0 ? "\(job.attemptCount) attempts" : nil].compactMap { $0 }
                if !details.isEmpty { Text(details.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
                if job.downloadable {
                    Button(downloading == job.id ? "Downloading…" : "Download", systemImage: "arrow.down.to.line") {
                        Task { await download(job) }
                    }.buttonStyle(.bordered).disabled(downloading != nil)
                }
            }
        }
    }

    private func load() async {
        refreshSequence += 1
        let sequence = refreshSequence
        do {
            let result = try await api.memberRead(Queue.self, path: Self.path, keyDecodingStrategy: .convertFromSnakeCase)
            guard !Task.isCancelled, sequence == refreshSequence else { return }
            queue = result
            error = nil
        } catch {
            if !Task.isCancelled, sequence == refreshSequence { self.error = error }
        }
    }

    private func download(_ job: Job) async {
        guard downloading == nil else { return }
        downloading = job.id
        defer { downloading = nil }
        do {
            let link = try await api.memberRead(Download.self, path: Self.path, query: [.init(name: "export", value: job.id.uuidString.lowercased())])
            guard Self.allowed(link.downloadUrl) else { throw URLError(.badURL) }
            let (temporaryFile, response) = try await SlipSurgeHTTP.download(URLRequest(url: link.downloadUrl,
                cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 120))
            defer { try? FileManager.default.removeItem(at: temporaryFile) }
            guard response.statusCode == 200, Self.allowed(response.url),
                  response.mimeType == (job.format == "gif" ? "image/gif" : "video/mp4"), api.account.memberID == api.userID else {
                throw URLError(.cannotParseResponse)
            }
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            exportDirectory = directory
            let safeFilename = URL(filePath: link.filename).lastPathComponent
            guard safeFilename.lowercased().hasSuffix(".\(job.format)") else { throw URLError(.cannotParseResponse) }
            let file = directory.appending(path: safeFilename, directoryHint: .notDirectory)
            try FileManager.default.moveItem(at: temporaryFile, to: file)
            exportFile = ExportFile(url: file)
        } catch {
            removeExport()
            if !Task.isCancelled { downloadFailed = true }
        }
    }

    private static func allowed(_ url: URL?) -> Bool {
        url?.scheme == "https" && url?.host == storageHost && url?.port == nil && url?.user == nil && url?.password == nil &&
            url?.path.hasPrefix("/storage/v1/object/sign/contact-recap-exports/") == true
    }

    private func removeExport() {
        if let exportDirectory { try? FileManager.default.removeItem(at: exportDirectory) }
        exportDirectory = nil
    }
}
