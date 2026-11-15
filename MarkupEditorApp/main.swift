//
//  main.swift
//  MarkupEditorApp
//

import SwiftUI

if let mode = HeadlessExport.mode(from: CommandLine.arguments) {
    HeadlessExport.run(mode)
} else if SingleInstance.yieldToRunningInstance() {
    exit(0)
} else {
    MarkupEditorApp.main()
}
