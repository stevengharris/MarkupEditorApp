//
//  SubscriptionSettingsSection.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// Connection to a markupeditor.app membership, which unlocks updates.
struct SubscriptionSettingsSection: View {

    @State private var isConnecting = false

    private let model = SubscriptionModel.shared

    var body: some View {
        Section("Subscription") {
            switch model.state {
            case .unknown:
                LabeledContent("Status") {
                    ProgressView()
                        .controlSize(.small)
                }
            case .disconnected, .awaitingCode:
                LabeledContent("Status", value: "Not connected")
                Button("Connect…", action: connect)
            case .expired(let email):
                LabeledContent("Status", value: "Sign-in expired for \(email)")
                Button("Reconnect…", action: connect)
            case .unavailable(let email):
                LabeledContent("Status", value: "Couldn't reach markupeditor.app to confirm \(email)")
                HStack {
                    Button("Try Again", action: retry)
                    Button("Disconnect", action: disconnect)
                }
            case .connected(let member):
                LabeledContent("Account", value: member.email)
                LabeledContent("Status", value: member.isPaid ? "Unlimited subscription" : "No active subscription")
                HStack {
                    if member.isPaid, BuildVariant.current == .evaluation {
                        Button("Upgrade to Unlimited", action: upgrade)
                    }
                    Button("Disconnect", action: disconnect)
                }
            }
        }
        .disabled(model.isWorking)
        .sheet(isPresented: $isConnecting) {
            ConnectSubscriptionSheet()
        }
    }

    private func connect() {
        isConnecting = true
    }

    private func retry() {
        Task { await model.refresh() }
    }

    private func disconnect() {
        Task { await model.disconnect() }
    }

    private func upgrade() {
        UpdateManager.shared.upgradeToUnlimited()
    }
}
