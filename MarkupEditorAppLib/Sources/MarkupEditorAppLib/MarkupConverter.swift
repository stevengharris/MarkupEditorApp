//
//  MarkupConverter.swift
//  MarkupEditorAppLib
//

import Foundation
import MarkupEditor

/// A successful decode of the `{result, warnings, metadata}` envelope `MarkupWKWebView`'s
/// import/export functions return as JSON, with `result` guaranteed present (the throwing
/// functions below raise `MarkupConversionError` instead of returning this with a nil result).
public struct DecodedConversion: Sendable {
    public let result: String
    public let warnings: [String]
    public let metadata: String?
}

/// Higher-level, throwing conversion API built on `MarkupWKWebView`'s low-level, non-throwing
/// import/export functions. Owns the decode/error-interpretation step that
/// `MarkupDocumentView.swift` used to do inline against `MarkupDocumentError` -- moved here so
/// it's usable without a host app (e.g. a future CLI), and so `MarkupDocumentView.swift` only
/// needs to catch and log, not decode.
@MainActor
public enum MarkupConverter {

    public static func importMarkdownDecoded(_ webView: MarkupWKWebView, content: String) async throws(MarkupConversionError) -> DecodedConversion {
        let raw = await webView.importMarkdown(content: content)
        guard let importValue = ImportExportValue.decode(from: raw) else {
            throw .unexpectedImport
        }
        guard let html = importValue.result else {
            throw .unableToImport(importValue.warnings.joined(separator: "; "))
        }
        return DecodedConversion(result: html, warnings: importValue.warnings, metadata: importValue.metadata)
    }

    public static func exportMarkdownDecoded(_ webView: MarkupWKWebView, content: String) async throws(MarkupConversionError) -> DecodedConversion {
        let raw = await webView.exportMarkdown(content: content)
        guard let exportValue = ImportExportValue.decode(from: raw) else {
            throw .unexpectedExport
        }
        guard let markdown = exportValue.result else {
            throw .unableToExport(exportValue.warnings.joined(separator: "; "))
        }
        return DecodedConversion(result: markdown, warnings: exportValue.warnings, metadata: exportValue.metadata)
    }

    public static func runExporterDecoded(_ webView: MarkupWKWebView, name: String) async throws(MarkupConversionError) -> (data: Data, warnings: [String]) {
        try decode(await webView.runExporter(name: name), name: name)
    }

    nonisolated static func decode(_ run: ExporterRun, name: String) throws(MarkupConversionError) -> (data: Data, warnings: [String]) {
        switch run {
        case .result(let raw):
            return try ImportExportValue.decodeExportOutput(from: raw, pluginName: name)
        case .notRegistered(let registered):
            throw .pluginNotRegistered(name: name, registered: registered)
        case .noResult:
            throw .pluginReturnedNoResult(name)
        }
    }
}
