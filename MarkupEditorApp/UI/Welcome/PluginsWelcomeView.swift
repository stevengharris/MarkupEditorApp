//
//  PluginsWelcomeView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// The Welcome page for choosing plugins to install, listing the catalog's CodeViews and Exporters.
struct PluginsWelcomeView: View {

    @Bindable var model: PluginsWelcomeModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Identify any plugins you want to install now. Use the Plugins tab in the side panel later to install/uninstall plugins.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
            VStack(alignment: .leading, spacing: 12) {
                content
            }
            .padding(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.gray.opacity(0.1))
            }
            status
        }
        .task { await model.discovery.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.discovery.state {
        case .loading:
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Loading plugins…")
                    .foregroundStyle(.secondary)
            }
        case .failed, .empty:
            Text(PluginsWelcomeModel.unavailableMessage)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        case .content:
            group("CodeViews", type: .codeview)
            group("Exporters", type: .exporter)
        }
    }

    @ViewBuilder private func group(_ title: String, type: PluginType) -> some View {
        let entries = model.entries(for: type)
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.headline)
                ForEach(entries) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Toggle(entry.name, isOn: Binding(
                            get: { model.isAlreadyInstalled(entry, type: type) || model.isSelected(entry, type: type) },
                            set: { model.setSelected($0, entry: entry, type: type) }
                        ))
                        .disabled(model.isAlreadyInstalled(entry, type: type) || model.isInstalling)
                        Text(entry.description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.leading, 20)
                    }
                }
            }
        }
    }

    @ViewBuilder private var status: some View {
        if model.isInstalling {
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Installing…")
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 8)
        } else if !model.failures.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("Could not install:")
                ForEach(model.failures, id: \.self) { failure in
                    Text(failure)
                }
                Text("Use the Plugins tab in the side panel to install them later.")
            }
            .font(.caption)
            .foregroundStyle(.red)
            .padding(.top, 8)
        }
    }
}

#Preview {
    PluginsWelcomeView(model: PluginsWelcomeModel())
        .padding(20)
        .frame(width: 460)
}
