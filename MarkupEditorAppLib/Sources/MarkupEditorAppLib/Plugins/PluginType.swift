//
//  PluginType.swift
//  MarkupEditorAppLib
//

/// The kinds of plugin MarkupEditor installs.
public enum PluginType: Sendable {
    case exporter
    case codeview

    /// How the kind reads in the log.
    public var logName: String {
        switch self {
        case .codeview: "CodeView"
        case .exporter: "Exporter"
        }
    }
}
