//
//  EditingSettingsSection.swift
//  MarkupEditorApp
//

import SwiftUI

/// The editing preferences: spelling, predictive text, and document width. Shared by the
/// Settings window and the Welcome flow, each of which supplies the surrounding `Form`.
struct EditingSettingsSection: View {

    var body: some View {
        Group {
            LabeledContent("Spelling:") {
                Toggle("Correct while typing", isOn: spellingCorrectionBinding())
            }
            Text("Present small popup with a correction while typing.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            LabeledContent("Predictive text:") {
                Toggle("Inline while typing", isOn: inlinePredictionsBinding())
            }
            Text("Present light text predictions inline while typing.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            LabeledContent("Document width:") {
                HStack(spacing: 4) {
                    TextField("", value: columnWidthBinding(), format: .number.grouping(.never))
                        .labelsHidden()
                        .multilineTextAlignment(.trailing)
                        .frame(width: 60)
                    Stepper("", value: columnWidthBinding(), in: AppConfig.columnWidthRange, step: 10)
                        .labelsHidden()
                }
            }
            .padding(EdgeInsets(top: 2, leading: 0, bottom: 0, trailing: 0))
            Text("Max width of centered column holding the document.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
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

    private func columnWidthBinding() -> Binding<Int> {
        Binding(
            get: { AppConfig.shared.columnWidth },
            set: { newValue in
                let clamped = min(max(newValue, AppConfig.columnWidthRange.lowerBound), AppConfig.columnWidthRange.upperBound)
                AppConfig.update { $0.columnWidth = clamped }
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
    Form {
        EditingSettingsSection()
    }
    .frame(width: 460, height: 360)
}
