//
//  TemplateSeeding.swift
//  MarkupEditorAppLib
//

import Foundation

/// Writes the built-in templates into the templates folder at launch.
@MainActor
public enum TemplateSeeding {

    /// UserDefaults key holding the folders already seeded, so a template the user deletes is not put back.
    public static let seededKey = "seededTemplates"

    public enum Failure: LocalizedError {
        case indexMissing

        public var errorDescription: String? {
            switch self {
            case .indexMissing: "templates.json is missing from the app"
            }
        }
    }

    /// Seeds the built-ins the index describes into `library` and records their names in `defaults`.
    /// A problem reading the index is logged and seeds nothing. Returns the folders it wrote.
    /// - Parameters:
    ///   - index: Supplies the bytes of the built-in templates index.
    ///   - data: Returns the bytes of a bundled file by name, or nil when it is missing.
    @discardableResult
    public static func seed(
        into library: UserLibrary,
        index: () throws -> Data,
        data: (String) -> Data?,
        defaults: UserDefaults,
        log: EditLog = .shared
    ) -> [String] {
        let builtIns: [UserLibrary.BuiltIn]
        do {
            builtIns = try UserLibrary.builtIns(index: try index(), data: data)
        } catch {
            log.warning("The built-in templates could not be read: \(error.localizedDescription)", category: "Template")
            return []
        }
        let seeded = Set(defaults.stringArray(forKey: seededKey) ?? [])
        let copied = library.seed(builtIns, skipping: seeded)
        if !copied.isEmpty {
            defaults.set(Array(seeded.union(copied)).sorted(), forKey: seededKey)
        }
        return copied
    }
}
