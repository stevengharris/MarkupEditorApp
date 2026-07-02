//
//  Functions.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/28/26.
//

import AppKit

func isLightMode() -> Bool {
    NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? false : true
}
