//
//  BuiltInTemplates.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditorAppLib

/// The templates the app ships, read from the bundle's templates.json and the files it names.
enum BuiltInTemplates {

    static func index() throws -> Data {
        guard let url = Bundle.main.url(forResource: "templates", withExtension: "json") else {
            throw TemplateSeeding.Failure.indexMissing
        }
        return try Data(contentsOf: url)
    }

    /// The bytes of a bundled file, or nil when it is missing. Bundled resources are flattened into one folder.
    static func data(_ name: String) -> Data? {
        let url = Bundle.main.url(forResource: (name as NSString).deletingPathExtension, withExtension: (name as NSString).pathExtension)
        return url.flatMap { try? Data(contentsOf: $0) }
    }

    /// The shipped templates, or none when the index cannot be read.
    static func all() -> [UserLibrary.BuiltIn] {
        (try? UserLibrary.builtIns(index: index(), data: data)) ?? []
    }
}
