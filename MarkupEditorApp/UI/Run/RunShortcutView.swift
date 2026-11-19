//
//  RunShortcutView.swift
//  MarkupEditorApp
//

import SwiftUI
import AppKit
import MarkupEditorAppLib

/// The dialog File > Run Shortcut opens: confirms the run, shows it running, then shows how it ended.
struct RunShortcutView: View {

    let model: RunShortcutModel
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch model.state {
            case .ready: ready
            case .running: running
            case .finished(let report): finished(report)
            }
            Spacer(minLength: 0)
            buttons
        }
        .padding(20)
        // One size for every state, so the dialog does not move or resize when the run starts or ends.
        .frame(width: 420, height: model.warning == nil ? 130 : 170, alignment: .topLeading)
    }

    private var ready: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Run Shortcut \u{201C}\(model.shortcut)\u{201D} on \(documentPhrase)?")
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)
            if let warning = model.warning {
                Text(warning)
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var documentPhrase: String {
        model.documentName.map { "\u{201C}\($0)\u{201D}" } ?? "the untitled document"
    }

    private var running: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.regular)
            Text("Running \u{201C}\(model.shortcut)\u{201D}")
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func finished(_ report: ShortcutRunReport) -> some View {
        Label("\u{201C}\(model.shortcut)\u{201D}: \(report.summary)", systemImage: symbol(report.level))
            .font(.headline)
            .foregroundStyle(color(report.level))
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Two buttons that keep their place and size in every state: the left one is Cancel, then Log File;
    /// the right one is OK, then Close.
    private var buttons: some View {
        HStack(spacing: 12) {
            Spacer()
            switch model.state {
            case .ready:
                button("Cancel", action: dismiss).keyboardShortcut(.cancelAction)
                button("OK") { model.run() }.keyboardShortcut(.defaultAction)
            case .running:
                button("Cancel") { model.cancel() }.keyboardShortcut(.cancelAction)
                button("Close", action: dismiss)
            case .finished(let report):
                button("Log File") { if let url = report.fileURL { NSWorkspace.shared.open(url) } }
                    .disabled(report.fileURL == nil)
                button("Close", action: dismiss).keyboardShortcut(.defaultAction)
            }
        }
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).frame(width: 64)
        }
    }

    private func symbol(_ level: LogLevel) -> String {
        switch level {
        case .info: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.octagon.fill"
        }
    }

    private func color(_ level: LogLevel) -> Color {
        switch level {
        case .info: .green
        case .warning: .orange
        case .error: .red
        }
    }
}
