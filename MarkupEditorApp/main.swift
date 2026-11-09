//
//  main.swift
//  MarkupEditorApp
//

import SwiftUI

if let format = HeadlessExport.format(from: CommandLine.arguments) {
    HeadlessExport.run(format)
} else if SingleInstance.yieldToRunningInstance() {
    exit(0)
} else {
    MarkupEditorApp.main()
}
