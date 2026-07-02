//
//  ImportExportValue.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

import Foundation

/// Import results from Markdown import and plugins are returned as `{ "result": string|null, "warnings": [string], "metadata": string|null }`.
/// Export results are..
// TODO: Fix comment
struct ImportExportValue: Decodable {
    let result: String?
    let warnings: [String]
    let metadata: String?

    static func decode(from jsonString: String?) -> ImportExportValue? {
        guard let data = jsonString?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ImportExportValue.self, from: data)
    }
}
