//
//  SingleInstance.swift
//  MarkupEditorApp
//

import AppKit

/// Keeps a second copy of the app from running beside the first. Both copies would share one sandbox
/// container: UserDefaults, installed plugins and recent documents.
enum SingleInstance {

    /// A running process with the same bundle identifier as this app.
    struct Peer {
        let processIdentifier: pid_t
        let isRegular: Bool
        let isTerminated: Bool
    }

    /// The peer to hand over to, if any. A headless export (`.prohibited` activation policy) is
    /// not an instance the user is working in, so it never counts.
    static func peerToYieldTo(from peers: [Peer], excluding processIdentifier: pid_t) -> Peer? {
        peers.first { $0.processIdentifier != processIdentifier && $0.isRegular && !$0.isTerminated }
    }

    /// Unit tests host the app while the user's own copy may be running.
    static var isTestRun: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    /// Brings an already-running copy to the front and returns true when this process should exit.
    static func yieldToRunningInstance() -> Bool {
        guard !isTestRun, let bundleIdentifier = Bundle.main.bundleIdentifier else { return false }
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
        let peers = running.map {
            Peer(processIdentifier: $0.processIdentifier, isRegular: $0.activationPolicy == .regular, isTerminated: $0.isTerminated)
        }
        guard let target = peerToYieldTo(from: peers, excluding: ProcessInfo.processInfo.processIdentifier) else { return false }
        let other = running.first { $0.processIdentifier == target.processIdentifier }
        #if DEBUG
        explain(other)
        #endif
        other?.activate()
        return true
    }

    #if DEBUG
    /// Without this a debug run just ends, with nothing to say why.
    private static func explain(_ other: NSRunningApplication?) {
        let path = other?.bundleURL?.path(percentEncoded: false) ?? "another copy"
        let message = "Another MarkupEditor is already running (\(path)). Quit it to run this build."
        FileHandle.standardError.write(Data((message + "\n").utf8))
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let alert = NSAlert()
        alert.messageText = "MarkupEditor is already running"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        app.activate()
        alert.runModal()
    }
    #endif
}
