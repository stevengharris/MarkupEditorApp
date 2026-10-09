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
#if DEBUG
    /// Debug builds allow every client without asking, unless this key is "prompt".
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

    /// The program that last used the channel, and whether that was within the last minute, for the
    /// window's indicator.
    private(set) var recentClient: String?
    private(set) var assistantActive = false
    private(set) var approvals: [ClientApproval] = []
    /// Why the listener could not start, shown in Settings while Assistants is on.
    private(set) var startupProblem: String?

    @ObservationIgnored var document: MarkupDocument?
    @ObservationIgnored var sourceShowing = false
    @ObservationIgnored private var server: ControlServer?
    @ObservationIgnored private var activityReset: Task<Void, Never>?
    @ObservationIgnored private let store = UserDefaultsApprovalStore()

    private init() {
        isEnabled = UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? Self.enabledByDefault
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
            It can read the document, including changes you have not saved, and the text you have selected. \
            If you allow editing, it can also replace the selection; each change is one undo step and \
            leaves the document unsaved for you to review.

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
/// Debug builds allow every client unless the consent default is "prompt", re-read on each request
/// so it can be switched while the app runs.
@MainActor
private struct DebugConsentSwitch: ControlAuthorizing {
    let asking: ControlAuthorizing

    func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess {
        guard UserDefaults.standard.string(forKey: AppControl.consentKey) == "prompt" else { return .readWrite }
        return await asking.access(for: client, prompting: prompting)
    }
}
#endif

/// Waits for an editor operation that reports completion through a handler, and gives up after a
/// deadline, since the editor drops a paste that arrives while another is in progress without
/// calling its handler.
@MainActor
private final class PasteCompletion {

    private var continuation: CheckedContinuation<Bool, Never>?

    static func wait(seconds: Double, start: (@escaping () -> Void) -> Void) async -> Bool {
        let completion = PasteCompletion()
        return await withCheckedContinuation { continuation in
            completion.continuation = continuation
            start { completion.finish(true) }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                completion.finish(false)
            }
        }
    }

    private func finish(_ value: Bool) {
        continuation?.resume(returning: value)
        continuation = nil
    }
}

/// The end-user operations, in every build.
@MainActor
struct AppControlFacade: ControlFacade {

    let control: AppControl

    fileprivate func webView() throws -> MarkupWKWebView {
        guard let webView = MarkupEditor.selectedWebView else { throw ControlError("No editor web view is available") }
        return webView
    }

    func appState() async throws -> JSONValue {
        let document = control.document
        var state: [String: JSONValue] = [
            "url": document?.url.map { .string($0.path(percentEncoded: false)) } ?? .null,
            "hasChanges": .bool(document?.hasChanges ?? false),
            "documentType": document?.url.map { .string($0.pathExtension) } ?? .null,
            "sourceShowing": .bool(control.sourceShowing),
            "hasWebView": .bool(MarkupEditor.selectedWebView != nil),
            "bundlePath": .string(Bundle.main.bundlePath),
        ]
#if DEBUG
        state["appHidden"] = .bool(NSApp.isHidden)
        state["appActive"] = .bool(NSApp.isActive)
        state["modalWindow"] = .string(NSApp.modalWindow.map { String(describing: type(of: $0)) } ?? "")
        state["windows"] = .array(NSApp.windows.map { window in
            [
                "id": .string(window.identifier?.rawValue ?? ""),
                "title": .string(window.title),
                "visible": .bool(window.isVisible),
                "key": .bool(window.isKeyWindow),
                "miniaturized": .bool(window.isMiniaturized),
                "occluded": .bool(!window.occlusionState.contains(.visible)),
                "delegate": .string(window.delegate.map { String(describing: type(of: $0)) } ?? "nil"),
            ]
        })
#endif
        return .object(state)
    }

    func bundlePath() -> String { Bundle.main.bundlePath }

    func markdown() async throws -> String {
        let webView = try webView()
        guard let html = await webView.getHtml() else { throw ControlError("The editor returned no HTML") }
        guard let document = control.document, !document.isHTMLish else { return html }
        var warnings: [String] = []
        document.syncMetadata(fromHTML: html, warnings: &warnings)
        do {
            let body = try await MarkupConverter.exportMarkdownDecoded(webView, content: html).result
            return document.injectYAMLFrontMatter(into: body)
        } catch {
            throw ControlError(error.localizedDescription)
        }
    }

    func selectionText() async throws -> String {
        await (try webView()).getSelectionState().selection ?? ""
    }

    /// Inserts `text` as text. The editor parses what it is pasted as HTML, so markup characters are
    /// escaped to arrive literally.
    func typeText(_ text: String) async throws {
        let webView = try webView()
        webView.window?.makeFirstResponder(webView)
        let escaped = text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let finished = await PasteCompletion.wait(seconds: 10) { done in webView.pasteText(escaped, handler: done) }
        guard finished else { throw ControlError("The editor did not finish the edit; it may be busy with another paste. Try again.") }
    }
}

#if DEBUG
/// Debug builds only: the broader control used for testing and demos.
extension AppControlFacade: DeveloperControlFacade {

    private static let menuCommands: [String: Notification.Name] = [
        "new": .menuNewDocument,
        "open": .menuOpenDocument,
        "save": .menuSaveDocument,
        "saveAs": .menuSaveAsDocument,
        "toggleSource": .menuToggleSource,
        "showSettings": .menuShowSettings,
    ]

    func saveDocument() async throws {
        guard let document = control.document else { throw ControlError("No document is open") }
        guard document.hasChanges else { return }
        NotificationCenter.default.post(name: .menuSaveDocument, object: nil)
        for _ in 0..<50 where document.hasChanges {
            try await Task.sleep(for: .milliseconds(100))
        }
        if document.hasChanges { throw ControlError("The document still has unsaved changes after 5 seconds") }
    }

    func runMenuCommand(_ name: String) async throws {
        if name == "hideApp" {
            NSApp.hide(nil)
            return
        }
        if name == "minimizeWindow" {
            NSApp.windows.first { $0.identifier?.rawValue == MarkupEditorApp.mainWindowID }?.miniaturize(nil)
            return
        }
        if name == "closeWindow" {
            // Clicks the real close button, so its retargeted action is what runs.
            NSApp.windows.first { $0.identifier?.rawValue == MarkupEditorApp.mainWindowID }?.standardWindowButton(.closeButton)?.performClick(nil)
            return
        }
        guard let notification = Self.menuCommands[name] else {
            throw ControlError("Unknown menu command '\(name)'. Use one of: closeWindow, \(Self.menuCommands.keys.sorted().joined(separator: ", "))")
        }
        let sourceWasShowing = control.sourceShowing
        NotificationCenter.default.post(name: notification, object: nil)
        // The handler runs asynchronously; wait for the visible effect so a following read is current.
        guard name == "toggleSource" else { return }
        for _ in 0..<30 where control.sourceShowing == sourceWasShowing {
            try await Task.sleep(for: .milliseconds(100))
        }
        if control.sourceShowing == sourceWasShowing { throw ControlError("The source view did not change within 3 seconds") }
    }

    func evalJS(_ script: String) async throws -> JSONValue {
        do {
            return Self.json(try await webView().evaluateJavaScript(script))
        } catch let error as NSError {
            let detail = error.userInfo["WKJavaScriptExceptionMessage"] as? String
            throw ControlError(detail.map { "JavaScript error: \($0)" } ?? error.localizedDescription)
        }
    }

    func html() async throws -> String {
        guard let html = await (try webView()).getHtml() else { throw ControlError("The editor returned no HTML") }
        return html
    }

    func screenshotEditor() async throws -> Data {
        let image = try await webView().takeSnapshot(configuration: nil)
        guard let tiff = image.tiffRepresentation,
              let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
            throw ControlError("Could not encode the snapshot as PNG")
        }
        return png
    }

    /// A JSON value for what `evaluateJavaScript` returns.
    static func json(_ value: Any?) -> JSONValue {
        switch value {
        case nil, is NSNull:
            return .null
        case let number as NSNumber:
            return CFGetTypeID(number) == CFBooleanGetTypeID() ? .bool(number.boolValue) : .number(number.doubleValue)
        case let string as String:
            return .string(string)
        case let array as [Any]:
            return .array(array.map { json($0) })
        case let dictionary as [String: Any]:
            return .object(dictionary.mapValues { json($0) })
        default:
            return .string(String(describing: value))
        }
    }
}
#endif
