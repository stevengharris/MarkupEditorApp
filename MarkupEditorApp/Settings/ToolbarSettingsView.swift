//
//  ToolbarSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct ToolbarSettingsView: View {
    @AppStorage("toolbarConfigJSON") private var toolbarConfigJSON: String = ""
    @State private var config = ToolbarConfig()
    @State private var loaded = false

    var body: some View {
        Form {
            Section("Visibility") {
                Toggle("Correction Bar", isOn: visibility("correctionBar"))
                Toggle("Insert Bar", isOn: visibility("insertBar"))
                Toggle("Style Menu", isOn: visibility("styleMenu"))
                Toggle("Style Bar", isOn: visibility("styleBar"))
                Toggle("Format Bar", isOn: visibility("formatBar"))
                Toggle("Search", isOn: visibility("search"))
            }
            Section("Insert Bar") {
                Toggle("Link", isOn: insertBar("link"))
                Toggle("Image", isOn: insertBar("image"))
                Toggle("Table Menu", isOn: insertBar("tableMenu"))
            }
            Section("Format Bar") {
                Toggle("Bold", isOn: formatBar("bold"))
                Toggle("Italic", isOn: formatBar("italic"))
                Toggle("Underline", isOn: formatBar("underline"))
                Toggle("Code", isOn: formatBar("code"))
                Toggle("Strikethrough", isOn: formatBar("strikethrough"))
                Toggle("Subscript", isOn: formatBar("subscript"))
                Toggle("Superscript", isOn: formatBar("superscript"))
            }
            Section("Style Bar") {
                Toggle("List Buttons", isOn: styleBar("list"))
                Toggle("Indent / Outdent Buttons", isOn: styleBar("dent"))
            }
            Section("Table Menu") {
                Toggle("Header Option", isOn: tableMenu("header"))
                Toggle("Border Option", isOn: tableMenu("border"))
            }
        }
        .formStyle(.grouped)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if !toolbarConfigJSON.isEmpty {
                config = ToolbarConfig.fromJSON(toolbarConfigJSON)
            }
        }
    }

    private func save() {
        if let json = config.asJSON() {
            toolbarConfigJSON = json
            NotificationCenter.default.post(name: .settingsSaved, object: nil)
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
    }

    private func visibility(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.visibility[key] ?? false },
            set: { config.visibility[key] = $0; save() }
        )
    }

    private func insertBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.insertBar[key] ?? false },
            set: { config.insertBar[key] = $0; save() }
        )
    }

    private func formatBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.formatBar[key] ?? false },
            set: { config.formatBar[key] = $0; save() }
        )
    }

    private func styleBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.styleBar[key] ?? false },
            set: { config.styleBar[key] = $0; save() }
        )
    }

    private func tableMenu(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.tableMenu[key] ?? false },
            set: { config.tableMenu[key] = $0; save() }
        )
    }
}
