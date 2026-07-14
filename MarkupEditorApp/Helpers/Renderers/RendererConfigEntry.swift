//
//  RendererConfigEntry.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/13/26.
//


    
    /// A single renderer entry as recorded in appconfig.json.
    /// `filename` is a bare filename (e.g. "markupeditor-markdown.js"); the app
    /// resolves it to a full bundle path at runtime when building the plugin configuration.
    public struct RendererConfigEntry: Codable {
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