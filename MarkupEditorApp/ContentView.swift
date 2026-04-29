//
//  ContentView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
internal import UniformTypeIdentifiers

private extension UTType {
    static let htmd = UTType("com.stevengharris.htmd") ?? .data
}

private enum ConfigKeys {
    static let toolbar = "toolbarConfigJSON"
    static let keymap = "keymapConfigJSON"
    static let behavior = "behaviorConfigJSON"
}

struct ContentView: View {
    
    @Environment(\.openSettings) private var openSettings
    @ObservedObject var selectImage = MarkupEditor.selectImage
    @State private var initialHtml = ""     // Used to create a MarkupEditorView w/initial content
    @State private var currentHtml = ""     // Used to display the raw HTML but avoid MarkupEditorView redrawing
    @State private var documentPickerShowing: Bool = false
    @State private var rawShowing: Bool = false
    @State private var hasChanges = false
    @State private var currentFileURL: URL?
    @State private var activeDocumentType: DocumentType?
    @State private var rootHtmlFilename: String = "index.html"

    @AppStorage(ConfigKeys.toolbar) private var toolbarConfigJSON = ""
    @AppStorage(ConfigKeys.keymap) private var keymapConfigJSON = ""
    @AppStorage(ConfigKeys.behavior) private var behaviorConfigJSON = ""
    @State private var markupConfiguration = MarkupWKWebViewConfiguration()
    @State private var configVersion = 0

    init() {
        // populateMarkupHtml runs synchronously inside makeNSView, before onAppear fires,
        // so stored overrides must be in markupConfiguration before the first render.
        let config = MarkupWKWebViewConfiguration()
        let defaults = UserDefaults.standard
        config.toolbarConfig = ContentView.decodeConfig(ToolbarConfig.self, from: defaults.string(forKey: ConfigKeys.toolbar) ?? "")
        config.keymapConfig = ContentView.decodeConfig(KeymapConfig.self, from: defaults.string(forKey: ConfigKeys.keymap) ?? "")
        config.behaviorConfig = ContentView.decodeConfig(BehaviorConfig.self, from: defaults.string(forKey: ConfigKeys.behavior) ?? "")
        _markupConfiguration = State(initialValue: config)
    }

    var body: some View {
        VStack(spacing: 0) {
            MarkupEditorView(markupDelegate: self, configuration: markupConfiguration, html: $initialHtml, placeholder: "Add document content...", id: "Document")
                .id(configVersion)
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
            handleShowHtml()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuShowSettings)) { _ in
            openSettings()
        }
        .onReceive(NotificationCenter.default.publisher(for: .settingsSaved)) { _ in
            // markupConfiguration is a reference type; mutate it first so the new
            // MarkupEditorView created by the configVersion increment picks up the
            // updated fields. Do not replace .id(configVersion) with a lighter
            // mechanism without verifying that populateMarkupHtml runs on recreation.
            applyStoredConfigOverrides()
            MarkupEditor.selectedWebView?.getHtml { html in
                self.initialHtml = html ?? ""
                self.configVersion += 1
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuOpenRecentDocument)) { notification in
            guard let url = notification.object as? URL else { return }
            checkSave { shouldProceed in
                guard shouldProceed else { return }
                openDocument(at: url)
            }
        }
        .onOpenURL { url in
            if MarkupEditor.selectedWebView != nil {
                AppDelegate.pendingFinderURL = nil
                checkSave { shouldProceed in
                    guard shouldProceed else { return }
                    openDocument(at: url)
                }
            } else {
                AppDelegate.pendingFinderURL = url
            }
        }
        // Note: fileImporter has no canChooseDirectories parameter; .htmd packages are presented
        // as files by the system because the UTI conforms to com.apple.package. The NSOpenPanel
        // in handleOpen() requires canChooseDirectories=true for the same reason — the two paths
        // are intentionally asymmetric.
        .fileImporter(isPresented: $documentPickerShowing, allowedContentTypes: [.html, .htmd], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                openDocument(at: url)
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
        .toolbar(removing: .title)
        .toolbar {
            ToolbarItem(placement: .navigation) {
                HStack(alignment: .bottom, spacing: 4) {
                    if let url = currentFileURL {
                        Image(nsImage: NSWorkspace.shared.icon(forFile: url.path))
                            .resizable()
                            .frame(width: 16, height: 16)
                    }
                    Text(currentFileURL?.lastPathComponent ?? "MarkupEditor")
                        .font(.headline)
                }
                .allowsHitTesting(false)
            }
            ToolbarSpacer(.flexible)
            ToolbarItem(placement: .primaryAction) {
                Button(action: { openSettings() }) {
                    Image(systemName: "gear")
                }
            }
        }
    }
    
    private func applyStoredConfigOverrides() {
        markupConfiguration.toolbarConfig = Self.decodeConfig(ToolbarConfig.self, from: toolbarConfigJSON)
        markupConfiguration.keymapConfig = Self.decodeConfig(KeymapConfig.self, from: keymapConfigJSON)
        markupConfiguration.behaviorConfig = Self.decodeConfig(BehaviorConfig.self, from: behaviorConfigJSON)
    }

    static func decodeConfig<T: Decodable>(_ type: T.Type, from json: String) -> T? {
        guard !json.isEmpty, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func getLocalImageSrcs(completion: @escaping ([String]) -> Void) {
        fetchLocalImageSrcs(from: MarkupEditor.selectedWebView, completion: completion)
    }

    private func setRepresentedURL(_ url: URL?) {
        NSApplication.shared.mainWindow?.representedURL = url
    }

    private func setCurrentHtml(_ handler: (()->Void)? = nil) {
        MarkupEditor.selectedWebView?.getHtml { html in
            currentHtml = html ?? ""
            handler?()
        }
    }
    
    private func imageSelected(url: URL) {
        guard let selectedWebView = MarkupEditor.selectedWebView else { return }
        markupImageToAdd(selectedWebView, url: url)
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
            handleSave { proceed(true) }
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
            initialHtml = currentHtml
            currentFileURL = nil
            setRepresentedURL(nil)
            rootHtmlFilename = "index.html"
            hasChanges = false
        }
    }

    private func handleOpen() {
        checkSave { shouldProceed in
            guard shouldProceed else { return }
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.html, .htmd]
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = true
            panel.canChooseFiles = true
            guard panel.runModal() == .OK, let url = panel.url else { return }
            openDocument(at: url)
        }
    }

    private func openDocument(at url: URL, handler: (()->Void)? = nil) {
        let ext = url.pathExtension.lowercased()
        guard ext == "html" || ext == "htmd" else {
            let alert = NSAlert()
            alert.messageText = "Unsupported file type"
            alert.informativeText = "Only .html and .htmd documents can be opened."
            alert.runModal()
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            switch ext {
            case "htmd":
                try openHtmd(at: url, handler: handler)
            default:
                try openHtml(at: url, handler: handler)
            }
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    private func openHtmd(at packageURL: URL, handler: (()->Void)? = nil) throws {
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
            throw DocumentOpenError.noWebviewAvailable
        }
        let rootHtmlURL = try findRootHTML(in: packageURL)
        let html = try String(contentsOf: rootHtmlURL, encoding: .utf8)
        rootHtmlFilename = rootHtmlURL.lastPathComponent
        let copiedPaths = try copyPackageAssets(from: packageURL, to: baseUrl)
        for src in localImageSrcs(in: html) {
            guard copiedPaths.contains(src) else {
                throw DocumentOpenError.missingPackageImage(src)
            }
        }
        MarkupEditor.selectedWebView?.setHtml(html)
        NSDocumentController.shared.noteNewRecentDocumentURL(packageURL)
        activeDocumentType = .htmd
        hasChanges = false
        setCurrentHtml() {
            currentFileURL = packageURL
            initialHtml = currentHtml
            setRepresentedURL(packageURL)
            handler?()
        }
    }

    private func openHtml(at fileURL: URL, handler: (()->Void)? = nil) throws {
        let html = try String(contentsOf: fileURL, encoding: .utf8)
        if let baseUrl = MarkupEditor.selectedWebView?.baseUrl {
            let parentDir = fileURL.deletingLastPathComponent()
            try copyImageAssets(srcs: localImageSrcs(in: html), from: parentDir, to: baseUrl, skipMissing: true)
        }
        MarkupEditor.selectedWebView?.setHtml(html)
        NSDocumentController.shared.noteNewRecentDocumentURL(fileURL)
        activeDocumentType = .html
        hasChanges = false
        setCurrentHtml() {
            initialHtml = currentHtml
            currentFileURL = fileURL
            setRepresentedURL(fileURL)
            handler?()
        }
    }

    private func handleSave(then completion: (()->Void)? = nil) {
        guard let url = currentFileURL else {
            showSavePanel(then: completion)
            return
        }
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
            completion?()
            return
        }
        let docType = activeDocumentType ?? .html
        getLocalImageSrcs { [self] srcs in
            MarkupEditor.selectedWebView?.getHtml { html in
                guard let html else {
                    completion?()
                    return
                }
                do {
                    switch docType {
                    case .htmd:
                        try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url, deleteOrphans: true)
                        try html.write(to: url.appendingPathComponent(rootHtmlFilename), atomically: true, encoding: .utf8)
                    case .html:
                        try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url.deletingLastPathComponent(), deleteOrphans: false)
                        try html.write(to: url, atomically: true, encoding: .utf8)
                    }
                    hasChanges = false
                    completion?()
                } catch {
                    let alert = NSAlert(error: error)
                    alert.runModal()
                    completion?()
                }
            }
        }
    }
    
    /// Open the HTML view
    private func handleShowHtml() {
        withAnimation(.easeInOut(duration: 0.25)) { rawShowing.toggle() }
    }

    private func handleSaveAs() {
        showSavePanel()
    }


    private func showSavePanel(then completion: (()->Void)? = nil) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.html, .htmd]
        panel.nameFieldStringValue = currentFileURL?.lastPathComponent ?? "Untitled.htmd"
        guard panel.runModal() == .OK, let url = panel.url else {
            completion?()
            return
        }
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
            completion?()
            return
        }
        let targetExt = url.pathExtension.lowercased()
        guard targetExt == "html" || targetExt == "htmd" else {
            completion?()
            return
        }
        getLocalImageSrcs { [self] srcs in
            MarkupEditor.selectedWebView?.getHtml { html in
                guard let html else {
                    completion?()
                    return
                }
                do {
                    switch targetExt {
                    case "htmd":
                        try saveAsHtmd(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
                    default:
                        try saveAsHtml(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
                    }
                    currentFileURL = url
                    NSDocumentController.shared.noteNewRecentDocumentURL(url)
                    setRepresentedURL(url)
                    activeDocumentType = targetExt == "htmd" ? .htmd : .html
                    hasChanges = false
                    completion?()
                } catch {
                    let alert = NSAlert(error: error)
                    alert.runModal()
                    completion?()
                }
            }
        }
    }

}

extension ContentView: MarkupDelegate {
    
    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        if let url = AppDelegate.consumePendingURL() {
            openDocument(at: url, handler: handler)
        } else {
            setCurrentHtml(handler)
        }
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

}

#Preview {
    ContentView()
}
