//
//  AboutView.swift
//  MarkupEditorApp
//

import SwiftUI
import AppKit
import MarkupEditorAppLib

/// The window opened by the About menu item.
struct AboutView: View {

    @Environment(\.dismissWindow) private var dismissWindow

    private let copyright = Bundle.main.object(forInfoDictionaryKey: "NSHumanReadableCopyright") as? String ?? ""

    var body: some View {
        VStack(spacing: 6) {
            Image(nsImage: NSApplication.shared.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)
            Text("MarkupEditor")
                .font(.title2.bold())
            Text(MarkupEditorApp.versionString)
                .foregroundStyle(.secondary)
            if let expiry = BuildVariant.expiryDate() {
                Text("Evaluation \(BuildVariant.isExpired() ? "ended" : "ends") \(expiry.formatted(date: .abbreviated, time: .shortened))")
                    .foregroundStyle(.secondary)
            }
            Button("Release Notes") {
                NotificationCenter.default.post(name: .showReleaseNotes, object: nil)
                dismissWindow(id: MarkupEditorApp.aboutWindowID)
            }
            .padding(.vertical, 8)
            Text("[Privacy Policy](https://www.markupeditor.app/privacy/)  |  [Terms of Use](https://www.markupeditor.app/terms-of-use/)")
                .font(.callout)
            if !copyright.isEmpty {
                Text(copyright)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(width: 320)
    }
}
