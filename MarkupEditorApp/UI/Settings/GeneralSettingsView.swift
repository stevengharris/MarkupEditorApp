//
//  GeneralSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct GeneralSettingsView: View {

    var body: some View {
        Spacer()
        Form {
            Section {
                LabeledContent("Version") {
                    Text(MarkupEditorApp.versionString)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Toggle("Correct spelling automatically", isOn: spellingCorrectionBinding())
                Toggle("Show inline predictive text", isOn: inlinePredictionsBinding())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        Spacer()
    }

    /// WKWebView's contenteditable spelling correction on macOS couples spellcheck and autocorrect —
    /// turning either HTML attribute off suppresses both the squiggle/popover and any substitution — so
    /// both AppConfig properties are kept in lockstep here rather than exposed as separate toggles.
    private func spellingCorrectionBinding() -> Binding<Bool> {
        Binding(
            get: { AppConfig.shared.spellcheck },
            set: { newValue in
                AppConfig.update {
                    $0.spellcheck = newValue
                    $0.autocorrect = newValue
                }
            }
        )
    }

    private func inlinePredictionsBinding() -> Binding<Bool> {
        Binding(
            get: { AppConfig.shared.inlinePredictions },
            set: { newValue in AppConfig.update { $0.inlinePredictions = newValue } }
        )
    }
}

#Preview {
    GeneralSettingsView()
}
