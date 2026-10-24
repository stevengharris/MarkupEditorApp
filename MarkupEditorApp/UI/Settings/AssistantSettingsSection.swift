//
//  AssistantSettingsSection.swift
//  MarkupEditorApp
//

import AppKit
import MarkupEditorAppLib
import SwiftUI

/// Turns assistant access on, lists the programs the user has allowed or blocked, and shows how to register
/// MarkupEditor with an assistant.
struct AssistantSettingsSection: View {

    @Bindable private var control = AppControl.shared
    @State private var showingImageInfo = false
    @State private var showingConnectInfo = false
    @State private var copiedTitle: String?

    /// More programs than this are shown in a scrolling list of `maxListHeight`.
    private static let maxUnscrolledPrograms = 2
    private static let maxListHeight: CGFloat = 80

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
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if control.isEnabled, let problem = control.startupProblem {
                LabeledContent("") {
                    Label(problem, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if control.isEnabled {
                LabeledContent("Images:") {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Toggle("Restrict remote image loading", isOn: $control.restrictImages)
                            Button("Image safety", systemImage: "info.circle") { showingImageInfo.toggle() }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.plain)
                                .popover(isPresented: $showingImageInfo, arrowEdge: .bottom) {
                                    Text("A remote image URL can inject behavior using URL parameters and other means when the image loads. You can add images yourself to avoid the risk of AI-assisted editing introducing a vulnerability.")
                                        .padding()
                                        .frame(width: 300)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                        }
                        Text("Remote images can introduce security vulnerabilities.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                LabeledContent("Programs:") {
                    allowedPrograms
                }
                if let toolPath {
                    LabeledContent("Connect:") {
                        registration(toolPath: toolPath)
                    }
                    .padding(.top, 2)
                }
            }
        }
        .onAppear { control.refreshApprovals() }
    }

    @ViewBuilder private var allowedPrograms: some View {
        if control.approvals.isEmpty {
            Text("None yet. You are asked the first time a program connects.")
                .foregroundStyle(.secondary)
                .frame(minHeight: 31, alignment: .top)
        } else if control.approvals.count <= Self.maxUnscrolledPrograms {
            programRows
        } else {
            ScrollView { programRows }
                .frame(height: Self.maxListHeight, alignment: .top)
                .alignmentGuide(.firstTextBaseline) { _ in 17 }
                .alignmentGuide(.lastTextBaseline) { _ in 17 }
        }
    }

    private var programRows: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(control.approvals, id: \.client) { approval in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading) {
                        Text("\(approval.client.name), \(description(of: approval.access))")
                        Text(approval.client.path)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer()
                    if approval.access == .denied {
                        Menu("Allow") {
                            Button("Reading Only") { control.allow(approval.client, .read) }
                            Button("Reading and Editing") { control.allow(approval.client, .readWrite) }
                        }
                        .fixedSize()
                    }
                    Button("Remove") { control.forget(approval.client) }
                        .help(approval.access == .denied ? "Forget the block; you are asked again the next time it connects." : "Forget this program; you are asked again the next time it connects.")
                }
            }
        }
    }

    private func description(of access: ClientAccess) -> String {
        switch access {
        case .readWrite: "reading and editing"
        case .read: "reading only"
        case .denied: "blocked"
        case .undecided: "undecided"
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
                copyButton("Copy Claude Code Command", text: MCPRegistration.claudeCodeCommand(toolPath: toolPath))
                copyButton("Copy JSON Config", text: MCPRegistration.jsonConfig(toolPath: toolPath))
                Button("About registering", systemImage: "info.circle") { showingConnectInfo.toggle() }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .popover(isPresented: $showingConnectInfo, arrowEdge: .bottom) {
                        Text("Registering tells an AI assistant how to start MarkupEditor's tool, so it can work with your open document. Claude Code: paste the copied command into a terminal. Other assistants that support MCP servers: add the copied JSON to their MCP configuration. Each program still asks for your approval the first time it connects.")
                            .padding()
                            .frame(width: 300)
                            .fixedSize(horizontal: false, vertical: true)
                    }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Shows "Copied" in place of the title for a moment; the title stays in the layout so the button keeps its width.
    private func copyButton(_ title: String, text: String) -> some View {
        Button {
            copy(text)
            copiedTitle = title
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                if copiedTitle == title { copiedTitle = nil }
            }
        } label: {
            ZStack {
                Text(title).opacity(copiedTitle == title ? 0 : 1)
                Text("Copied").opacity(copiedTitle == title ? 1 : 0)
            }
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

#Preview {
    Form {
        AssistantSettingsSection()
    }
    .frame(width: 460, height: 420)
}
