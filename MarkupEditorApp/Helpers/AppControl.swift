//
//  AppControl.swift
//  MarkupEditorApp
//

import AppKit
import MarkupEditor
import MarkupEditorAppLib
import Observation
internal import WebKit

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
    /// UserDefaults key recording that the user has accepted the privacy notice shown when Assistants is first turned on.
    static let privacyAcknowledgedKey = "ControlPrivacyAcknowledged"
    private static let enabledByDefault = false
#if DEBUG
    /// Debug builds ask like every other build, unless this key is "allow", which allows every client without asking.
    static let consentKey = "ControlConsent"
#endif

    /// Whether assistants may connect. Turning it off stops listening.
    var isEnabled: Bool {
        didSet {
            UserDefaults.standard.set(isEnabled, forKey: Self.enabledKey)
            EditLog.shared.info(isEnabled ? "AI assistants enabled" : "AI assistants disabled", category: "Control")
            reconcile()
            if isEnabled { Task { await refreshPendingSuggestions() } } else { pendingSuggestions = 0; suggestionSelected = false }
        }
    }

    /// How many suggestions are pending in the selected editor. Menu validation is synchronous and cannot ask the
    /// editor, so the Edit > Suggestions commands read this.
    private(set) var pendingSuggestions = 0
    /// Whether the selection is exactly one pending suggestion, which Accept+Next and Reject+Next act on.
    private(set) var suggestionSelected = false

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

    /// The pending count and selection state of `view`'s suggestions; empty when there is no editor or it cannot say.
    static func suggestionStatus(in view: MarkupWKWebView?) async -> SuggestionStatus {
        guard let view, let status = try? await view.suggestionStatus(), status.ok else { return SuggestionStatus(ok: true) }
        return status
    }

    /// The number of pending suggestions in `view`, zero when there is no editor or it cannot say.
    static func pendingSuggestionCount(in view: MarkupWKWebView?) async -> Int {
        await suggestionStatus(in: view).pending
    }

    /// The pending suggestions in `view`, none when there is no editor or it cannot say.
    static func pendingSuggestions(in view: MarkupWKWebView?) async -> [Suggestion] {
        guard let view, let list = try? await view.listSuggestions(), list.ok else { return [] }
        return list.suggestions.filter { $0.status == "pending" }
    }

    /// Proposes `saved` again in `view`, an editor holding the document they were made against, and returns how many
    /// could not be restored. They get new ids; their text, replacements and notes are as before.
    static func restoreSuggestions(_ saved: [Suggestion], in view: MarkupWKWebView) async -> Int {
        guard !saved.isEmpty else { return 0 }
        guard let blocks = try? await view.getBlocks(from: nil, limit: nil).blocks else { return saved.count }
        let edits = saved.compactMap { suggestion -> SuggestedEdit? in
            guard blocks.indices.contains(suggestion.block) else { return nil }
            return SuggestedEdit(block: suggestion.block, expected: blocks[suggestion.block].hash, find: suggestion.find,
                                 replace: suggestion.replace, note: suggestion.note)
        }
        guard !edits.isEmpty, let result = try? await view.proposeEdits(edits), result.ok else { return saved.count }
        return saved.count - result.results.filter { $0.status == "proposed" }.count
    }

    /// What to tell the user when some pending suggestions could not be put back after the editor reloaded, or nil
    /// when none were lost.
    static func restoreLossWarning(lost: Int, of total: Int) -> (message: String, detail: String)? {
        guard lost > 0 else { return nil }
        return ("Some suggestions could not be restored", "\(lost) of \(total) pending suggestions could not be put back after the editor reloaded, and are discarded.")
    }

    /// Re-reads the suggestion state from the selected editor. With `ifPending`, does nothing when none are pending:
    /// only a proposal, which always refreshes, can add one.
    func refreshPendingSuggestions(ifPending: Bool = false, in view: MarkupWKWebView? = nil) async {
        guard isEnabled else { pendingSuggestions = 0; suggestionSelected = false; return }
        if ifPending && pendingSuggestions == 0 { return }
        let status = await Self.suggestionStatus(in: view ?? MarkupEditor.selectedWebView)
        pendingSuggestions = status.pending
        suggestionSelected = status.selected
    }

    /// What to tell the user before the source view replaces the editor, or nil when no suggestion would be lost.
    static func sourceSwitchWarning(pending: Int) -> (message: String, detail: String)? {
        guard pending > 0 else { return nil }
        let count = pending == 1 ? "1 pending suggestion" : "\(pending) pending suggestions"
        return ("Switch to the source view?", "\(count) from an assistant will be discarded. The source view cannot show suggestions, and they are not restored when you return to the document.")
    }

    /// What to tell the user before the document and its editor are replaced or closed, or nil when no suggestion would be lost.
    static func discardWarning(pending: Int) -> (message: String, detail: String)? {
        guard pending > 0 else { return nil }
        let count = pending == 1 ? "1 pending suggestion" : "\(pending) pending suggestions"
        return ("Discard the pending suggestions?", "\(count) from an assistant will be discarded when the document is closed or replaced. Suggestions are not saved.")
    }

    /// The alert to show before the source view replaces the editor, with Cancel as the default button, or nil
    /// when no suggestion would be lost.
    static func sourceSwitchAlert(pending: Int) -> NSAlert? {
        sourceSwitchWarning(pending: pending).map { alert($0, confirm: "Switch") }
    }

    /// The alert to show before the document is closed or replaced, with Cancel as the default button, or nil
    /// when no suggestion would be lost.
    static func discardAlert(pending: Int) -> NSAlert? {
        discardWarning(pending: pending).map { alert($0, confirm: "Discard") }
    }

    private static func alert(_ warning: (message: String, detail: String), confirm: String) -> NSAlert {
        let alert = NSAlert()
        alert.messageText = warning.message
        alert.informativeText = warning.detail
        alert.alertStyle = .warning
        let cancel = alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: confirm)
        // A button titled Cancel is given Escape and no default; Return makes it the default button.
        cancel.keyEquivalent = "\r"
        return alert
    }

    /// The path of the bundled command line tool, which is also the only program allowed to connect.
    static var bundledToolURL: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("bin/markup")
    }

    /// Starts or stops the listener to match the setting.
    func reconcile() {
        if isEnabled { startListening() } else { stopListening() }
    }

    /// Turns assistant access on. The first time, the user must accept the privacy notice; Cancel is the default
    /// button, so a stray Return leaves it off. Returns whether access is now on.
    @discardableResult
    func enableAfterAcknowledging() -> Bool {
        if !UserDefaults.standard.bool(forKey: Self.privacyAcknowledgedKey) {
            guard Self.acknowledgesPrivacy() else { return false }
            UserDefaults.standard.set(true, forKey: Self.privacyAcknowledgedKey)
        }
        isEnabled = true
        return true
    }

    private static func acknowledgesPrivacy() -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Privacy and AI Assistance"
        alert.informativeText = "When you connect MarkupEditor to an AI assistant, the AI assistant will have access to the document you are editing. Depending on what AI assistant you connect with, your document might be shared with an external service, and will therefore be subject to the privacy policies of that service. By pressing OK below, you are acknowledging that you understand and agree."
        let cancel = alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "OK")
        // A button titled Cancel is given Escape and no default; Return makes it the default button.
        cancel.keyEquivalent = "\r"
        alert.alertStyle = .informational
        return alert.runModal() == .alertSecondButtonReturn
    }

    func refreshApprovals() {
        approvals = store.approvals()
    }

    func allow(_ client: ClientIdentity, _ access: ClientAccess) {
        store.save(access, for: client)
        Self.logDecision(access, for: client)
        approvals = store.approvals()
    }

    func forget(_ client: ClientIdentity) {
        store.revoke(client)
        approvals = store.approvals()
    }

    /// Records an allow or deny decision, naming the program but not its path.
    private static func logDecision(_ access: ClientAccess, for client: ClientIdentity) {
        let name = displayed(client.name)
        switch access {
        case .undecided: break
        case .denied: EditLog.shared.info("Denied \(name) access to MarkupEditor", category: "Control")
        case .read: EditLog.shared.info("Allowed \(name) to read documents", category: "Control")
        case .readWrite: EditLog.shared.info("Allowed \(name) to read and edit documents", category: "Control")
        }
    }

    private func startListening() {
        guard server == nil else { return }
        startupProblem = nil
        guard let tool = Self.bundledToolURL, let requirement = CodeSignaturePeerVerifier.designatedRequirement(ofCodeAt: tool) else {
            EditLog.shared.error("Control channel not started: the bundled markup tool's signature could not be read", category: "Control")
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
            EditLog.shared.error("Control channel not started: \(error.localizedDescription)", category: "Control")
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
            Self.logDecision(choice, for: client)
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
