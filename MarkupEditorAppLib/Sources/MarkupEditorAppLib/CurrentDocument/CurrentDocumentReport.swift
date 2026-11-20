//
//  CurrentDocumentReport.swift
//  MarkupEditorAppLib
//

/// What `markup current` writes and returns for a resolution.
public struct CurrentDocumentReport: Equatable, Sendable {
    /// For standard output: only the path, so a script can capture it.
    public let output: String?
    /// For standard error.
    public let message: String?
    public let exitCode: Int32

    public init(for resolution: CurrentDocumentResolution, requireSaved: Bool) {
        switch resolution {
        case .saved(let path):
            (output, message, exitCode) = (path, nil, 0)
        case .modified(let path):
            if requireSaved {
                (output, message, exitCode) = (nil, "error: the open document has unsaved changes", 4)
            } else {
                (output, message, exitCode) = (path, "warning: the open document has unsaved changes; the file on disk is older than the editor", 0)
            }
        case .untitled:
            (output, message, exitCode) = (nil, "error: the open document has not been saved", 3)
        case .accessDenied:
            (output, message, exitCode) = (nil, "error: macOS did not let this process read MarkupEditor's data; choose Allow if it asks, or allow it in System Settings > Privacy & Security", 5)
        case .unreadableState:
            (output, message, exitCode) = (nil, "error: MarkupEditor's current-document file could not be read; quit and reopen MarkupEditor, or update markup and MarkupEditor to the same version", 2)
        case .notRunning:
            (output, message, exitCode) = (nil, "error: MarkupEditor is not running", 2)
        }
    }
}
