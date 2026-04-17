//
//  MarkupEditorApp.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor

@main
struct MarkupEditorApp: App {
    
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
    
    init() {
        MarkupEditor.allowLocalImages = true
        // Set to true to allow the MarkupWKWebView to be inspectable from the Safari Development
        // menu in iOS/macCatalyst 16.4 or higher.
        MarkupEditor.isInspectable = true
    }
}
