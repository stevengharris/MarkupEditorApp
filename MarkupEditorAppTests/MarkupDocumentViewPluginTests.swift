//
//  MarkupDocumentViewPluginTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

// Regression guard for the plugin menu action notification names.
// Prevents a silent rename of .menuExportPlugin/.menuImportPlugin from breaking
// the notification-based wiring between AppDelegate and MarkupDocumentView.
@MainActor struct MarkupDocumentViewPluginTests {

    @Test func menuExportPluginNotificationNameIsDefined() {
        // Verify the raw value — prevents silent renames breaking the wiring
        #expect(Notification.Name.menuExportPlugin.rawValue == "menuExportPlugin")
    }

    @Test func menuImportPluginNotificationNameIsDefined() {
        #expect(Notification.Name.menuImportPlugin.rawValue == "menuImportPlugin")
    }

}
