//
//  CurrentDocumentResolver.swift
//  MarkupEditorAppLib
//

import AppKit

/// What `markup current` has to say about the file the app published.
public enum CurrentDocumentResolution: Equatable, Sendable {
    /// A saved document with no unsaved changes.
    case saved(path: String)
    /// A saved document whose editor holds changes the file does not.
    case modified(path: String)
    case untitled
    case notRunning
    /// The system refused to let this process read the app's state file.
    case accessDenied
}

public enum CurrentDocumentResolver {

    /// `state` is nil when there is no readable file. A file from a process that is gone, or from another
    /// version of the format, is treated as no file.
    /// A path whose file does not exist, such as a Save As that has not written yet, counts as untitled.
    public static func resolve(_ state: CurrentDocumentState?, isRunning: (Int32) -> Bool,
                               fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) -> CurrentDocumentResolution {
        guard let state, state.version == CurrentDocumentState.currentVersion, isRunning(state.pid) else { return .notRunning }
        guard let path = state.path, !path.isEmpty, fileExists(path) else { return .untitled }
        return state.modified ? .modified(path: path) : .saved(path: path)
    }

    public static func resolve(_ reading: CurrentDocumentFile.Reading, isRunning: (Int32) -> Bool,
                               fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) -> CurrentDocumentResolution {
        switch reading {
        case .state(let state): resolve(state, isRunning: isRunning, fileExists: fileExists)
        case .missing, .unreadable: .notRunning
        case .denied: .accessDenied
        }
    }

    public static func isMarkupEditorRunning(pid: Int32, bundleIdentifier: String = "com.stevengharris.MarkupEditorApp") -> Bool {
        guard pid > 0 else { return false }
        return NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == bundleIdentifier
    }
}
