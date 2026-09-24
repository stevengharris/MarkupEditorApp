//
//  UpdateSettingsSection.swift
//  MarkupEditorApp
//

import SwiftUI

/// Automatic-update preferences, available while a paid member is connected.
struct UpdateSettingsSection: View {

    @Bindable private var updateManager = UpdateManager.shared

    var body: some View {
        Section("Updates") {
            Toggle("Automatically check for updates", isOn: $updateManager.automaticallyChecks)
            Toggle("Automatically install updates", isOn: $updateManager.automaticallyDownloads)
            LabeledContent("Last checked") {
                if let date = updateManager.lastCheckDate {
                    Text(date, format: .relative(presentation: .named))
                } else {
                    Text("Never")
                }
            }
            Button("Check for Updates Now", action: updateManager.checkNow)
        }
    }
}
