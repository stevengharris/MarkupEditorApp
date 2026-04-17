//
//  ContentView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
internal import UniformTypeIdentifiers

struct ContentView: View {
    
    @ObservedObject var selectImage = MarkupEditor.selectImage
    @State private var currentHtml = ""
    @State private var documentPickerShowing: Bool = false
    @State private var rawShowing: Bool = false
    @State private var initialHtml: String
    @State private var hasChanges = false
    @State private var currentFileURL: URL?

    /// The `markupConfiguration` holds onto the name of any userResourceFiles we set in init.
    private let markupConfiguration = MarkupWKWebViewConfiguration()
    
    var body: some View {
        VStack(spacing: 0) {
            MarkupEditorView(markupDelegate: self, configuration: markupConfiguration, html: $initialHtml, placeholder: "Add document content...", id: "Document")
            if rawShowing {
                VStack {
                    Divider()
                    HStack {
                        Spacer()
                        Text("Document HTML")
                        Spacer()
                    }
                    .background(
                        Color(nsColor: NSColor.unemphasizedSelectedContentBackgroundColor)
                    )
                    ScrollView {
                        Text(currentHtml)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .font(Font.system(size: StyleContext.P.fontSize))
                            .padding([.top, .bottom, .leading, .trailing], 8)
                    }
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuNewDocument)) { _ in
            handleNew()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuOpenDocument)) { _ in
            handleOpen()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuSaveDocument)) { _ in
            handleSave()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuSaveAsDocument)) { _ in
            handleSaveAs()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuShowHtml)) { _ in
            rawDocument()
        }
        .fileImporter(isPresented: $documentPickerShowing, allowedContentTypes: [.html], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                loadHtml(from: url)
            }
        }
        .fileImporter(isPresented: $selectImage.value, allowedContentTypes: MarkupEditor.supportedImageTypes, allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                imageSelected(url: url)
            }
        }
        .onDisappear { MarkupEditor.selectedWebView = nil }
    }
    
    init() {
        _initialHtml = State(initialValue: "")
    }
    
    private func setCurrentHtml(_ handler: (()->Void)? = nil) {
        MarkupEditor.selectedWebView?.getHtml { html in
            currentHtml = html ?? ""
            handler?()
        }
    }
    
    private func imageSelected(url: URL) {
        guard let view = MarkupEditor.selectedWebView else { return }
        markupImageToAdd(view, url: url)
    }

    // MARK: - File operations (driven by menu notifications on macOS)

    /// Present a save/discard/cancel alert if the document has unsaved changes.
    /// Calls the completion with true to proceed, false to cancel.
    /// On macOS, runs modally and calls completion synchronously.
    /// On Catalyst, presents a UIAlertController and calls completion asynchronously.
    private func checkSave(then proceed: @escaping (Bool) -> Void) {
        guard hasChanges else {
            proceed(true)
            return
        }
        let alert = NSAlert()
        alert.messageText = "Do you want to save the changes to this document?"
        alert.informativeText = "Your changes will be lost if you don't save them."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Don't Save")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        let response = alert.runModal()
        switch response {
        case .alertFirstButtonReturn:
            handleSave()
            proceed(true)
        case .alertSecondButtonReturn:
            hasChanges = false
            proceed(true)
        default:
            proceed(false)
        }
    }

    private func handleNew() {
        checkSave { [self] shouldProceed in
            guard shouldProceed else { return }
            MarkupEditor.selectedWebView?.emptyDocument {
                setCurrentHtml()
            }
            currentFileURL = nil
            hasChanges = false
        }
    }

    private func handleOpen() {
        checkSave { shouldProceed in
            guard shouldProceed else { return }
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.html]
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = false
            guard panel.runModal() == .OK, let url = panel.url else { return }
            loadHtml(from: url)
        }
    }

    private func loadHtml(from url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            let html = try String(contentsOf: url, encoding: .utf8)
            MarkupEditor.selectedWebView?.setHtml(html)
            currentFileURL = url
            hasChanges = false
            setCurrentHtml()
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    private func handleSave() {
        if let url = currentFileURL {
            saveHtml(to: url)
        } else {
            showSavePanel()
        }
    }

    private func handleSaveAs() {
        showSavePanel()
    }

    private func showSavePanel() {
        guard let window = NSApplication.shared.keyWindow else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.html]
        panel.nameFieldStringValue = currentFileURL?.lastPathComponent ?? "Untitled.html"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            saveHtml(to: url)
            currentFileURL = url
        }
    }

    private func saveHtml(to url: URL) {
        MarkupEditor.selectedWebView?.getHtml { html in
            guard let html else { return }
            do {
                try html.write(to: url, atomically: true, encoding: .utf8)
                hasChanges = false
            } catch {
                let alert = NSAlert(error: error)
                alert.runModal()
            }
        }
    }
    
    /// Open the HTML view
    func rawDocument() {
        withAnimation(.easeInOut(duration: 0.25)) { rawShowing.toggle() }
    }

}

extension ContentView: MarkupDelegate {
    
    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        setCurrentHtml(handler)
    }
    
    func markupInput(_ view: MarkupWKWebView) {
        hasChanges = true
        // This is way too heavyweight, but it suits the purposes of the demo
        view.getSelectionState() { selectionState in
            MarkupEditor.selectionState.reset(from: selectionState)
            setCurrentHtml()
        }
    }

    /// In the MacOS version, which uses the markupeditor-base toolbar, pressing the Select... button in the insert
    /// image dialog calls back to the messageHandler (i.e., the MarkupCoordinator) with `selectImage`, which
    /// in turn invokes the delegate's `markupSelectImage` method. We trigger the dialog by toggling the
    /// value of   selectImage .
    func markupSelectImage(_ view: MarkupWKWebView?) {
        selectImage.value.toggle()
    }
    
    /// Callback received after a local image has been added to the document.
    ///
    /// Note the URL will be to a copy of the image you identified, copied to the caches directory for the app.
    /// You may want to copy this image to a proper storage location. For demo, I'm leaving the print statement
    /// in to highlight what happened.
    func markupImageAdded(url: URL) {
        print("Image added from \(url.path)")
    }


}

#Preview {
    ContentView()
}
