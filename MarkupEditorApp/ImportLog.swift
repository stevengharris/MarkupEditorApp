//
//  ImportLog.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/1/26.
//

import OSLog

@Observable
class ImportLog {
    private(set) var entries: [String] = []
    private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "Import")
    
    public init() {}

    func info(_ message: String) {
        logger.info("\(message)")
        entries.append("ℹ️ \(message)")
    }
    
    func warning(_ message: String) {
        logger.warning("\(message)")
        entries.append("⚠️ \(message)")
    }

    func error(_ message: String) {
        logger.error("\(message)")
        entries.append("❌ \(message)")
    }

    func clear() { entries = [] }
}
