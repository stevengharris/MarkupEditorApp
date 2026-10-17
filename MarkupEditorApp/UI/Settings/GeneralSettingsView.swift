//
//  GeneralSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib

struct GeneralSettingsView: View {

    enum SettingGroup: String, CaseIterable, Identifiable {
        case editing = "Editing"
        case updates = "Updates"
        case assistants = "Assistants"
        var id: Self { self }
    }

    @State private var settingGroup: SettingGroup = .updates

    private let subscription = SubscriptionModel.shared

    var body: some View {
        Spacer()
        VStack(spacing: 0) {
            Picker("", selection: $settingGroup) {
                ForEach(SettingGroup.allCases) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .pickerStyle(.segmented)

            switch settingGroup {
            case .editing:
                Form {
                    Text("")
                    Toggle("Correct spelling automatically", isOn: spellingCorrectionBinding())
                    Toggle("Show inline predictive text", isOn: inlinePredictionsBinding())
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
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .updates:
                Form {
                    Text("")
                    LabeledContent("Version:") {
                        Text(MarkupEditorApp.versionString)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 8)
                    SubscriptionSettingsSection()
                    if subscription.isPaidConnected, BuildVariant.current != .evaluation {
                        UpdateSettingsSection()
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .assistants:
                Form {
                    Text("")
                    AssistantSettingsSection()
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    GeneralSettingsView()
}
