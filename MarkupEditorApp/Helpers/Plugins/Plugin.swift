//
//  Plugin.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/13/26.
//

/// A single plugin entry as recorded in appconfig.json.
/// `filename` is a bare filename (e.g. "markupeditor-mermaid.js"); the app
/// holds onto the file in particular plugin ,anager's defaultDir.
public struct Plugin: Codable, Equatable, Hashable {
    
    public static func == (lhs: Plugin, rhs: Plugin) -> Bool {
        lhs.name == rhs.name && lhs.filename == rhs.filename
    }
    
    public let name: String           // Name to display for the plugin
    public let filename: String       // JS module filename
    
    public init(name: String, filename: String) {
        self.name = name
        self.filename = filename
    }
    
    public nonisolated init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey { case name, filename }
        let c = try decoder.container(keyedBy: Keys.self)
        name = try c.decode(String.self, forKey: .name)
        filename = try c.decode(String.self, forKey: .filename)
    }
    
}
