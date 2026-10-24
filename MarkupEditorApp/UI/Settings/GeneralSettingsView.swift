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

    /// UserDefaults key for the selected segment.
    static let settingGroupKey = "generalSettingGroup"

    @AppStorage(Self.settingGroupKey) private var settingGroup: SettingGroup = .editing

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
                    EditingSettingsSection()
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
                .frame(width: 460)
                .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 306, maxHeight: .infinity)
        Spacer()
    }
}

#Preview {
    GeneralSettingsView()
}
