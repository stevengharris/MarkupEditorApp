//
//  SubscriptionSettingsSection.swift
//  MarkupEditorApp
//

import SwiftUI
import AppKit
import MarkupEditorAppLib

/// Connection to a markupeditor.app account, whose subscription unlocks the
/// Unlimited version and its updates.
struct SubscriptionSettingsSection: View {

    @State private var isConnecting = false

    private let model = SubscriptionModel.shared

    var body: some View {
        Group {
            switch model.state {
            case .unknown:
                LabeledContent("Account:") {
                    ProgressView()
                        .controlSize(.small)
                }
            case .disconnected, .awaitingCode:
                LabeledContent("Account:", value: "Not connected")
                LabeledContent("") {
                    Button("Connect…", action: connect)
                }
            case .expired(let email):
                LabeledContent("Account:", value: "Connection expired for \(email)")
                LabeledContent("") {
                    Button("Reconnect…", action: connect)
                }
            case .unavailable(let email):
                LabeledContent("Account:", value: "Couldn't reach markupeditor.app to confirm \(email)")
                LabeledContent("") {
                    HStack {
                        Button("Try Again", action: retry)
                        Button("Disconnect", action: disconnect)
                    }
                }
            case .connected(let member):
                LabeledContent("Account:", value: member.email)
                LabeledContent("Subscription:", value: member.isPaid ? "Active" : "None")
                LabeledContent("") {
                    HStack {
                        if member.isPaid {
                            if BuildVariant.current == .evaluation {
                                Button("Install Unlimited Version", action: install)
                            }
                        } else {
                            Button("Subscribe…", action: subscribe)
                        }
                        Button("Disconnect", action: disconnect)
                    }
                }
            }
            LabeledContent("") {
                Text("Connecting this app to your markupeditor.app account lets it install the Unlimited version and its updates.")
                    .font(.subheadline)
                    .frame(width: 320, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 8)
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

    private func install() {
        UpdateManager.shared.upgradeToUnlimited()
    }

    private func subscribe() {
        if let url = URL(string: "https://www.markupeditor.app/downloads/") {
            NSWorkspace.shared.open(url)
        }
    }
}
