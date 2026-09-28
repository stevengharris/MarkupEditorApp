//
//  ConnectSubscriptionSheet.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// Email step, then the emailed-code step, for connecting a markupeditor.app account.
struct ConnectSubscriptionSheet: View {

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""

    private let model = SubscriptionModel.shared

    private var sentTo: String? {
        if case .awaitingCode(let email, _) = model.state { return email }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect to Your Account")
                .font(.headline)
            if let sentTo {
                Text("Enter the code emailed to \(sentTo). It expires in a few minutes.")
                    .fixedSize(horizontal: false, vertical: true)
                TextField("Code", text: $code)
                    .textContentType(.oneTimeCode)
            } else {
                Text("Enter the email address for your markupeditor.app account. A one-time code will be emailed to you.")
                    .fixedSize(horizontal: false, vertical: true)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
            }
            if let error = model.error {
                Text(error.localizedDescription)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                if sentTo != nil {
                    Button("Send a New Code", action: resend)
                        .disabled(model.isWorking)
                }
                Spacer()
                if model.isWorking {
                    ProgressView()
                        .controlSize(.small)
                }
                Button("Cancel", role: .cancel, action: cancel)
                Button(sentTo == nil ? "Send Code" : "Connect", action: submit)
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.isWorking || (sentTo == nil ? email : code).trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 400)
        .onAppear(perform: prefill)
        .onChange(of: model.state, dismissWhenConnected)
    }

    private func prefill() {
        email = model.lastEmail ?? ""
    }

    private func submit() {
        Task {
            if sentTo == nil {
                await model.requestCode(email: email)
            } else {
                await model.verify(code: code)
            }
        }
    }

    private func resend() {
        guard let sentTo else { return }
        code = ""
        Task { await model.requestCode(email: sentTo) }
    }

    private func cancel() {
        model.cancel()
        dismiss()
    }

    private func dismissWhenConnected() {
        if case .connected = model.state {
            dismiss()
        }
    }
}
