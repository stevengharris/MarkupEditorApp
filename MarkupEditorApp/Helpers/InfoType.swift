//
//  InfoType.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import Foundation

enum InfoType: String, CaseIterable, Identifiable {
    case log = "Log"
    case document = "Document"
    case metadata = "Metadata"
    var id: Self { self }
}
