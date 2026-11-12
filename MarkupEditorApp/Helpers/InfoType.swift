//
//  InfoType.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import Foundation

enum InfoType: String, CaseIterable, Identifiable {
    case log = "Log"
    case plugins = "Plugins"
    case templates = "Templates"
    var id: Self { self }

    /// UserDefaults key holding the selected tab.
    static let storageKey = "infoType"
}
