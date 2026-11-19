//
//  RunShortcutModel.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation

/// The state of the dialog that runs one Shortcut: ready, running, then finished with a report.
@MainActor @Observable
public final class RunShortcutModel: Identifiable {

    public enum State: Equatable, Sendable {
        case ready
        case running
        case finished(ShortcutRunReport)
    }

    public let id = UUID()
    public let shortcut: String
    /// The open document's file name, or nil for an untitled one.
    public let documentName: String?
    /// Whether the document had unsaved changes when the dialog opened; the Shortcut only sees the saved file.
    public let hasUnsavedChanges: Bool
    public private(set) var state: State = .ready

    /// What the user should know before running, or nil when there is nothing to warn about: an untitled
    /// document gives the Shortcut no file, and unsaved changes are not in the file it gets.
    public var warning: String? {
        if documentName == nil {
            return "Warning: This document has not been saved, so the Shortcut has no file. Cancel and save if needed."
        }
        if hasUnsavedChanges {
            return "Warning: Unsaved changes. The Shortcut only has access to the saved file. Cancel and save if needed."
        }
        return nil
    }

    @ObservationIgnored private let runner: @MainActor (String) async -> ShortcutRunReport
    @ObservationIgnored private var task: Task<Void, Never>?

    public init(shortcut: String, documentName: String?, hasUnsavedChanges: Bool = false,
                runner: @escaping @MainActor (String) async -> ShortcutRunReport) {
        self.shortcut = shortcut
        self.documentName = documentName
        self.hasUnsavedChanges = hasUnsavedChanges
        self.runner = runner
    }

    /// Starts the run. Does nothing unless the dialog is ready. The run goes on if the dialog is closed.
    public func run() {
        guard state == .ready else { return }
        state = .running
        let name = shortcut
        let runner = runner
        task = Task { [self] in
            let report = await runner(name)
            state = .finished(report)
            task = nil
        }
    }

    /// Stops waiting for a running Shortcut. The run ends as cancelled and the dialog shows that; the
    /// Shortcut itself may still finish in Shortcuts. Does nothing unless a run is going.
    public func cancel() {
        guard state == .running else { return }
        task?.cancel()
    }

    /// Waits for a started run to finish. Returns at once when none is running.
    public func finished() async {
        await task?.value
    }
}
