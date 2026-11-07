//
//  main.swift
//  MarkupEditorApp
//

import SwiftUI

if let format = HeadlessExport.format(from: CommandLine.arguments) {
    HeadlessExport.run(format)
} else {
    MarkupEditorApp.main()
}
