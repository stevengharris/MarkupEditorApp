//
//  ExporterRun.swift
//  MarkupEditorAppLib
//

import Foundation

/// What running an exporter plugin in the editor's web view produced.
public enum ExporterRun: Equatable, Sendable {
    /// The plugin's raw JSON envelope.
    case result(String)
    /// No exporter is registered under the requested name. `registered` lists the exporter
    /// names that are, so the mismatch can be seen.
    case notRegistered(registered: [String])
    /// The editor was not available, the script failed, or the plugin returned nothing.
    case noResult

    /// Decodes the value the script in `MarkupWKWebView.runExporter(name:)` returns.
    public init(script value: Any?) {
        guard let fields = value as? [String: Any] else {
            self = .noResult
            return
        }
        if let registered = fields["notRegistered"] as? [String] {
            self = .notRegistered(registered: registered)
        } else if let result = fields["result"] as? String {
            self = .result(result)
        } else {
            self = .noResult
        }
    }
}
