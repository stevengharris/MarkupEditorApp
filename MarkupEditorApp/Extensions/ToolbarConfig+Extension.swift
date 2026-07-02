//
//  ToolbarConfig+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/28/26.
//

import MarkupEditor
import AppKit
import SwiftUI

extension ToolbarConfig {

    func accentColor(_ colorScheme: ColorScheme) -> NSColor {
        guard let pair = appearance?.accentColor else { return .controlAccentColor }
        return NSColor(cssColor: colorScheme == .dark ? pair.dark : pair.light) ?? .controlAccentColor
    }

    func toolbarBgColor(_ colorScheme: ColorScheme) -> NSColor {
        guard let pair = appearance?.toolbarBg else { return .unemphasizedSelectedContentBackgroundColor }
        return NSColor(cssColor: colorScheme == .dark ? pair.dark : pair.light) ?? .unemphasizedSelectedContentBackgroundColor
    }

}
