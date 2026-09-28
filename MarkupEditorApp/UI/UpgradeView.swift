//
//  UpgradeView.swift
//  MarkupEditorApp
//

#if EVAL_VERSION
import SwiftUI
import AppKit
import MarkupEditorAppLib

/// The only window an expired evaluation opens.
struct UpgradeView: View {

    private let model = SubscriptionModel.shared

    private var message: String {
        guard case .connected(let member) = model.state else {
            return "Subscribe to continue using MarkupEditor, or connect if you already have a markupeditor.app account."
        }
        return member.isPaid
            ? "Your markupeditor.app account is connected and has an active subscription. Install the Unlimited version to keep using MarkupEditor."
            : "Your markupeditor.app account doesn't have an active subscription. Subscribe at markupeditor.app, then install the Unlimited version."
    }

    private var isConnected: Bool {
        if case .connected = model.state { return true }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Evaluation Period Ended")
                .font(.headline)
                .padding([.horizontal, .top], 20)
            Text(message)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20)
                .padding(.top, 8)
            Form {
                SubscriptionSettingsSection()
            }
            .formStyle(.grouped)
            .scrollDisabled(true)
            .fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                if !isConnected {
                    Button("Subscribe…", action: subscribe)
                }
                Button("Quit", action: quit)
            }
            .padding([.horizontal, .bottom], 20)
        }
        .frame(width: 460)
        .onDisappear(perform: quit)
    }

    private func subscribe() {
        if let url = URL(string: "https://www.markupeditor.app/downloads/") {
            NSWorkspace.shared.open(url)
        }
    }

    private func quit() {
        NSApplication.shared.terminate(nil)
    }
}
#endif
