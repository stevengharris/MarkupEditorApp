//
//  ImportExportValue.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

import Foundation

/// Import and export results, from Markdown and from plugins, are returned as
/// `{ "result": string|null, "warnings": [string], "metadata": string|null }`.
struct ImportExportValue: Decodable {
    let result: String?
    let warnings: [String]
    let metadata: String?

    static func decode(from jsonString: String?) -> ImportExportValue? {
        guard let data = jsonString?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ImportExportValue.self, from: data)
    }

    /// Decodes `raw` into real output bytes plus warnings, or a `MarkupDocumentError`
    /// describing why a plugin produced nothing usable: an undecodable envelope, a nil or
    /// empty result, or a `result` that isn't valid base64. On the empty-result path, `reason`
    /// carries the envelope's own warnings -- a plugin's failure path typically explains itself
    /// there (e.g. `{result: null, warnings: ["DOCX conversion failed: ..."]}`), so that's the
    /// one place the specific cause survives into the thrown error rather than being dropped.
    /// Pure -- no logging, no I/O -- so it's testable without a live web view.
    static func decodeExportOutput(from raw: String, pluginName: String) throws -> (data: Data, warnings: [String]) {
        guard let envelope = decode(from: raw) else {
            throw MarkupDocumentError.pluginReturnedUndecodableResult(name: pluginName, raw: String(raw.prefix(500)))
        }
        guard let base64 = envelope.result else {
            throw MarkupDocumentError.pluginProducedEmptyResult(name: pluginName, reason: envelope.warnings.joined(separator: "; "))
        }
        guard let outputData = Data(base64Encoded: base64) else {
            throw MarkupDocumentError.pluginReturnedInvalidResult(pluginName)
        }
        guard !outputData.isEmpty else {
            throw MarkupDocumentError.pluginProducedEmptyResult(name: pluginName, reason: envelope.warnings.joined(separator: "; "))
        }
        return (outputData, envelope.warnings)
    }
}
