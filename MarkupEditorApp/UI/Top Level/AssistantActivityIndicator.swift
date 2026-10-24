//
//  AssistantActivityIndicator.swift
//  MarkupEditorApp
//

import SwiftUI

/// Shows in the toolbar while assistants may connect: dimmed until an assistant has used MarkupEditor
/// in the last minute, then in the tint color, so the user can see when something other than them is
/// working with the document. Clicking it opens the Assistants settings.
struct AssistantActivityIndicator: View {

    @Environment(\.openSettings) private var openSettings
    private let control = AppControl.shared

    var body: some View {
        let active = control.assistantActive
        let message = active ? "\(control.recentClient ?? "An assistant") is working with this document" : "Assistants can connect. Open the Assistants settings."
        Button {
            UserDefaults.standard.set(GeneralSettingsView.SettingGroup.assistants.rawValue, forKey: GeneralSettingsView.settingGroupKey)
            UserDefaults.standard.set(SettingsView.Pane.general.rawValue, forKey: SettingsView.selectedTabKey)
            openSettings()
        } label: {
            Image(systemName: "sparkles")
                .foregroundStyle(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        }
        .help(message)
        .accessibilityLabel(message)
    }
}
