//
//  InfoSectionLayout.swift
//  MarkupEditorApp
//

import SwiftUI

/// Measures shared by the disclosure sections of the info sidebar.
enum InfoSectionLayout {
    /// The indentation a disclosure group gives its content, removed so rows line up under the heading.
    static let disclosureIndent: CGFloat = 13

    /// How far the disclosure chevrons are moved right, clear of the splitter that overlaps the panel's left edge.
    static let chevronInset: CGFloat = 8
}
