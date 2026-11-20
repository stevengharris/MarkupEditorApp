//
//  ShortcutCallbackURL.swift
//  MarkupEditorAppLib
//

import Foundation

/// What a callback URL reports.
public enum ShortcutCallback: Equatable, Sendable {
    case success(result: String)
    case error(message: String)
    case cancel
}

/// The URLs Shortcuts opens when a run ends, and their parsing.
public enum ShortcutCallbackURL {
    public static let scheme = "markupeditor-action"

    static let defaultErrorMessage = "Shortcuts reported an error."

    /// Whether `url` belongs to this scheme, well-formed or not.
    public static func handles(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme
    }

    public static func urls(for id: UUID) -> (success: URL, error: URL, cancel: URL) {
        (url(host: "success", id: id), url(host: "error", id: id), url(host: "cancel", id: id))
    }

    /// The run id and what was reported, or nil when `url` is not a well-formed Shortcut callback.
    public static func parse(_ url: URL) -> (id: UUID, callback: ShortcutCallback)? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == scheme,
              let host = components.host,
              let run = components.queryItems?.first(where: { $0.name == "run" })?.value,
              let id = UUID(uuidString: run) else { return nil }
        func value(_ name: String) -> String? { components.queryItems?.first { $0.name == name }?.value }
        switch host {
        case "success": return (id, .success(result: value("result") ?? ""))
        case "error": return (id, .error(message: value("errorMessage") ?? defaultErrorMessage))
        case "cancel": return (id, .cancel)
        default: return nil
        }
    }

    private static func url(host: String, id: UUID) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.queryItems = [URLQueryItem(name: "run", value: id.uuidString)]
        return components.url ?? URL(fileURLWithPath: "/")
    }
}
