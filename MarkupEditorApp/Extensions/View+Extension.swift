//
//  View+Extension.swift
//  MarkupEditorApp
//

import SwiftUI

extension View {
    /// Shows the view only while its page is current, without removing it from the layout.
    func pageVisibility(_ visible: Bool) -> some View {
        self
            .opacity(visible ? 1 : 0)
            .allowsHitTesting(visible)
            .accessibilityHidden(!visible)
    }
}
