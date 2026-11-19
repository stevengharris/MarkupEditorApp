//
//  CurrentDocumentFile.swift
//  MarkupEditorAppLib
//

import Foundation

/// The file the app keeps current and `markup current` reads. It sits in the app container's `tmp` folder,
/// beside the control socket.
public struct CurrentDocumentFile: Sendable {
    public static let fileName = "current-document.json"

    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    /// Where the app writes, given `NSHomeDirectory()` as the app sees it, which inside the sandbox is the container.
    public static func url(containerHome: String) -> URL {
        URL(fileURLWithPath: "\(containerHome)/tmp/\(fileName)")
    }

    /// Where a process outside the sandbox reads.
    public static func defaultURL(home: String = NSHomeDirectory(), bundleIdentifier: String = "com.stevengharris.MarkupEditorApp") -> URL {
        url(containerHome: "\(home)/Library/Containers/\(bundleIdentifier)/Data")
    }

    /// Replaces the file whole, so a reader sees the old state or the new one and never part of either.
    public func write(_ state: CurrentDocumentState) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try state.encoded().write(to: url, options: .atomic)
    }

    /// What reading the file found.
    public enum Reading: Equatable, Sendable {
        case state(CurrentDocumentState)
        case missing
        /// The file is there but is not a valid state, such as one cut short or from a future version of the format.
        case unreadable
        /// The system refused the read, as macOS does until the user lets a process such as Shortcuts see another app's data.
        case denied
    }

    public func read() -> Reading {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch let error as NSError {
            return Self.isPermissionRefusal(error) ? .denied : (Self.isMissing(error) ? .missing : .unreadable)
        }
        guard let state = try? CurrentDocumentState.decode(from: data) else { return .unreadable }
        return .state(state)
    }

    static func isMissing(_ error: NSError) -> Bool {
        error.domain == NSCocoaErrorDomain && (error.code == NSFileReadNoSuchFileError || error.code == NSFileNoSuchFileError)
    }

    static func isPermissionRefusal(_ error: NSError) -> Bool {
        if error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoPermissionError { return true }
        let posix = (error.userInfo[NSUnderlyingErrorKey] as? NSError).flatMap { $0.domain == NSPOSIXErrorDomain ? Int32($0.code) : nil }
        return posix == EPERM || posix == EACCES
    }

    /// The state, or nil when the file is missing, empty or unreadable.
    public func load() -> CurrentDocumentState? {
        if case .state(let state) = read() { return state }
        return nil
    }

    public func remove() {
        try? FileManager.default.removeItem(at: url)
    }
}
