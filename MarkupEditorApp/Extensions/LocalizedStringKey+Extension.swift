//
//  LocalizedStringKey+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/28/26.
//

import SwiftUI

extension LocalizedStringKey.StringInterpolation {
    mutating func appendInterpolation(_ value: DocumentType) {
        appendInterpolation(value.localizedStringResource)
    }
}
