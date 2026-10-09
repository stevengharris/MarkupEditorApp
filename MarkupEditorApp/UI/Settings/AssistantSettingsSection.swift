//
//  AssistantSettingsSection.swift
//  MarkupEditorApp
//

import AppKit
import MarkupEditorAppLib
import SwiftUI

/// Turns assistant access on, lists the programs the user has allowed, and shows how to register
/// MarkupEditor with an assistant.
struct AssistantSettingsSection: View {

    @Bindable private var control = AppControl.shared

    private var toolPath: String? {
        AppControl.bundledToolURL?.path(percentEncoded: false)
    }

    var body: some View {
        Group {
            LabeledContent("Assistants:") {
                VStack(alignment: .leading, spacing: 4) {
                    Toggle("Allow assistants to connect", isOn: $control.isEnabled)
                    Text("Lets an AI assistant you set up, such as Claude, work with the document you have open. You are asked before each program gets any access.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if control.isEnabled, let problem = control.startupProblem {
                LabeledContent("") {
                    Label(problem, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if control.isEnabled {
                LabeledContent("Allowed:") {
                    allowedPrograms
                }
                if let toolPath {
                    LabeledContent("Connect:") {
                        registration(toolPath: toolPath)
                    }
                }
            }
        }
        .onAppear { control.refreshApprovals() }
    }

    @ViewBuilder private var allowedPrograms: some View {
        if control.approvals.isEmpty {
            Text("None yet. You are asked the first time a program connects.")
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(control.approvals, id: \.client) { approval in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading) {
                            Text("\(approval.client.name), \(approval.access == .readWrite ? "reading and editing" : "reading only")")
                            Text(approval.client.path)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        Spacer()
                        Button("Remove") { control.forget(approval.client) }
                    }
                }
            }
        }
    }

    private func registration(toolPath: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Register this tool with your assistant:")
                .foregroundStyle(.secondary)
            Text(toolPath)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .lineLimit(2)
                .truncationMode(.middle)
            HStack {
                Button("Copy Claude Code Command") { copy(MCPRegistration.claudeCodeCommand(toolPath: toolPath)) }
                Button("Copy JSON Config") { copy(MCPRegistration.jsonConfig(toolPath: toolPath)) }
            }
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}
