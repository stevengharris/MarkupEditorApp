//
//  DocumentType.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/28/26.
//

import Foundation
import SwiftUI

internal import UniformTypeIdentifiers

enum DocumentType: String, CaseIterable, CustomLocalizedStringResourceConvertible {
    case html
    case md
    case htmd

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .html:  "HTML"
        case .md:    "Markdown"
        case .htmd:  "MarkupEditor"
        }
    }

    var description: String { String(localized: localizedStringResource) }

    func ext() -> String {
        return rawValue
    }

    static func `for`(ext: String) -> DocumentType? {
        DocumentType(rawValue: ext)
    }
    
    static func `for`(url: URL?) -> DocumentType? {
        guard let ext = url?.pathExtension else { return nil }
        return self.for(ext: ext)
    }

    static func exts() -> [String] {
        DocumentType.allCases.map { $0.rawValue }
    }

    static func utTypes() -> [UTType] {
        exts().compactMap { ext in UTType(filenameExtension: ext) }
    }
}
