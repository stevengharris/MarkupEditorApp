//
//  AppControl.swift
//  MarkupEditorApp
//

import AppKit
import MarkupEditor
import MarkupEditorAppLib
import Observation
import os
internal import WebKit

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "Control")

/// Lets an assistant, through `markup mcp`, read and edit the open document once the user allows it.
/// Listens on a socket inside the app container only while the Assistants setting is on. Each
/// connection must come from the command line tool bundled with this app, and each client program
/// is asked about before it can do anything.
@MainActor @Observable
final class AppControl {

    static let shared = AppControl()

    /// UserDefaults key for the Assistants setting.
    static let enabledKey = "ControlEnabled"
    /// UserDefaults key for limiting the images an assistant adds to relative paths.
    static let restrictImagesKey = "ControlRestrictImages"
#if DEBUG
    /// Debug builds ask like every other build, unless this key is "allow", which allows every client without asking.
    static let consentKey = "ControlConsent"
    private static let enabledByDefault = true
#else
    private static let enabledByDefault = false
#endif

    /// Whether assistants may connect. Turning it off stops listening.
    var isEnabled: Bool {
        didSet {
            UserDefaults.standard.set(isEnabled, forKey: Self.enabledKey)
            reconcile()
        }
    }

    /// Whether images an assistant adds must have a relative path; any other source is turned into a link.
    var restrictImages: Bool {
        didSet { UserDefaults.standard.set(restrictImages, forKey: Self.restrictImagesKey) }
    }

    /// The program that last used the channel, and whether that was within the last minute, for the
    /// window's indicator.
    private(set) var recentClient: String?
    private(set) var assistantActive = false
    private(set) var approvals: [ClientApproval] = []
    /// Why the listener could not start, shown in Settings while Assistants is on.
    private(set) var startupProblem: String?

    @ObservationIgnored var document: MarkupDocument?
    @ObservationIgnored var sourceShowing = false
    /// The text the source view shows (HTML for an HTML document, Markdown otherwise); read-only for assistants.
    @ObservationIgnored var sourceText = ""
    /// Runs the assistant calls that change the document one at a time, in arrival order.
    let edits = EditQueue()
    /// What save_document does to ask the document view to save; replaceable so tests never reach a real save panel.
    var requestSave: @MainActor () -> Void = { NotificationCenter.default.post(name: .menuSaveDocument, object: nil) }
    @ObservationIgnored private var server: ControlServer?
    @ObservationIgnored private var activityReset: Task<Void, Never>?
    @ObservationIgnored private let store = UserDefaultsApprovalStore()

    private init() {
        isEnabled = UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? Self.enabledByDefault
        restrictImages = UserDefaults.standard.object(forKey: Self.restrictImagesKey) as? Bool ?? true
        approvals = store.approvals()
    }

    /// The path of the bundled command line tool, which is also the only program allowed to connect.
    static var bundledToolURL: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("bin/markup")
    }

    /// Starts or stops the listener to match the setting.
    func reconcile() {
        if isEnabled { startListening() } else { stopListening() }
    }

    func refreshApprovals() {
        approvals = store.approvals()
    }

    func allow(_ client: ClientIdentity, _ access: ClientAccess) {
        store.save(access, for: client)
        approvals = store.approvals()
    }

    func forget(_ client: ClientIdentity) {
        store.revoke(client)
        approvals = store.approvals()
    }

    private func startListening() {
        guard server == nil else { return }
        startupProblem = nil
        guard let tool = Self.bundledToolURL, let requirement = CodeSignaturePeerVerifier.designatedRequirement(ofCodeAt: tool) else {
            logger.error("Control channel not started: the bundled markup tool's signature could not be read")
            startupProblem = "The command line tool inside MarkupEditor could not be verified."
            return
        }
        let dispatcher = ControlDispatcher(
            facade: AppControlFacade(control: self),
            tools: Self.offeredTools,
            authorizer: makeAuthorizer(),
            onAuthorizedUse: { [weak self] client in self?.noteActivity(by: client) }
        )
        let server = ControlServer(
            path: ControlClient.appPath(containerHome: NSHomeDirectory()),
            peerVerifier: CodeSignaturePeerVerifier(requirement: requirement)
        ) { line in
            await dispatcher.handle(line)
        }
        do {
            try server.start()
            self.server = server
        } catch {
            logger.error("Control channel not started: \(error.localizedDescription, privacy: .public)")
            startupProblem = "Assistants could not connect: \(error.localizedDescription)"
        }
    }

    private func stopListening() {
        server?.stop()
        server = nil
        startupProblem = nil
    }

    private static var offeredTools: [ControlTool] {
#if DEBUG
        ControlTools.all
#else
        ControlTools.endUser
#endif
    }

    private func makeAuthorizer() -> ControlAuthorizing {
        let authorizer = ControlAuthorizer(store: store, isEnabled: { [weak self] in self?.isEnabled ?? false }) { [weak self] client in
            let choice = Self.ask(about: client)
            self?.approvals = self?.store.approvals() ?? []
            return choice
        }
#if DEBUG
        return DebugConsentSwitch(asking: authorizer)
#else
        return authorizer
#endif
    }

    private func noteActivity(by client: ClientIdentity?) {
        recentClient = client.map { Self.displayed($0.name) } ?? "A program"
        assistantActive = true
        activityReset?.cancel()
        activityReset = Task { [weak self] in
            try? await Task.sleep(for: .seconds(60))
            if !Task.isCancelled { self?.assistantActive = false }
        }
        approvals = store.approvals()
    }

    /// Text from a client for display in a prompt: control and invisible formatting characters removed,
    /// and shortened.
    static func displayed(_ text: String, limit: Int = 80) -> String {
        let hidden = CharacterSet.controlCharacters.union(.illegalCharacters).union(CharacterSet(charactersIn: "\u{200B}"..."\u{200F}")).union(CharacterSet(charactersIn: "\u{202A}"..."\u{202E}")).union(CharacterSet(charactersIn: "\u{2066}"..."\u{2069}"))
        let cleaned = String(String.UnicodeScalarView(text.unicodeScalars.filter { !hidden.contains($0) }))
        return cleaned.count > limit ? String(cleaned.prefix(limit)) + "…" : cleaned
    }

    /// The user's choice for a client that has not been decided yet. Don't Allow is the default button,
    /// so a stray Return does not grant anything.
    private static func ask(about client: ClientIdentity) -> ClientAccess {
        NSApp.activate(ignoringOtherApps: true)
        let name = displayed(client.name)
        let alert = NSAlert()
        alert.messageText = "Allow \(name) to use MarkupEditor?"
        alert.informativeText = """
            \(name) (\(displayed(client.path, limit: 200))) wants to work with the document you have open in MarkupEditor. \
            It can read the document, including changes you have not saved, and show you a place in it. \
            If you allow editing, it can also change the document, undo and redo, and save it to its file. \
            Each change is one undo step and leaves the document unsaved for you to review; a save cannot be undone with Undo.

            You can change this later in Settings under Assistants.
            """
        alert.addButton(withTitle: "Don't Allow")
        alert.addButton(withTitle: "Allow Reading Only")
        alert.addButton(withTitle: "Allow Reading and Editing")
        alert.alertStyle = .informational
        switch alert.runModal() {
        case .alertThirdButtonReturn: return .readWrite
        case .alertSecondButtonReturn: return .read
        default: return .denied
        }
    }
}

#if DEBUG
/// Debug builds ask like Release builds, unless the consent default is "allow", re-read on each request
/// so it can be switched while the app runs.
@MainActor
private struct DebugConsentSwitch: ControlAuthorizing {
    let asking: ControlAuthorizing

    func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess {
        if UserDefaults.standard.string(forKey: AppControl.consentKey) == "allow" { return .readWrite }
        return await asking.access(for: client, prompting: prompting)
    }
}
#endif
