//
//  BehaviorSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct BehaviorSettingsView: View {
    @AppStorage("behaviorConfigJSON") private var behaviorConfigJSON: String = ""
    @State private var config = BehaviorConfig()
    @State private var loaded = false

    var body: some View {
        Form {
            Toggle("Focus editor after load", isOn: behavior(\.focusAfterLoad))
            Toggle("Enable image selection", isOn: behavior(\.selectImage))
            Toggle("Enable link insertion", isOn: behavior(\.insertLink))
            Toggle("Enable image insertion", isOn: behavior(\.insertImage))
            Toggle("Show paragraph style indicator", isOn: behavior(\.showStyle))
        }
        .formStyle(.grouped)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if !behaviorConfigJSON.isEmpty {
                config = BehaviorConfig.fromJSON(behaviorConfigJSON)
            }
        }
    }

    private func save() {
        if let json = config.asJSON() {
            behaviorConfigJSON = json
            NotificationCenter.default.post(name: .settingsSaved, object: nil)
        }
    }

    private func behavior(_ keyPath: WritableKeyPath<BehaviorConfig, Bool>) -> Binding<Bool> {
        Binding(
            get: { config[keyPath: keyPath] },
            set: { config[keyPath: keyPath] = $0; save() }
        )
    }
}
