//
//  Renderer.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/13/26.
//

/// A single renderer entry as recorded in appconfig.json.
/// `filename` is a bare filename (e.g. "markupeditor-markdown.js"); the app
/// holds onto the file in RendererManager's defaultDir.
public struct Renderer: Codable, Equatable, Hashable {
    
    public static func == (lhs: Renderer, rhs: Renderer) -> Bool {
        lhs.name == rhs.name && lhs.filename == rhs.filename
    }
    
    public let name: String           // Name to display for the renderer
    public let filename: String       // JS bundle filename
    
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
