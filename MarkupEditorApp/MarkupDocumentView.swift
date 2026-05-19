//
//  MarkupDocumentView.swift
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

struct MarkupDocumentView: View {
    
    typealias ConfigKeys = AppConfig.ConfigKey
    typealias ToggledState = AppConfig.ToggledState
    
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
    @AppStorage(ConfigKeys.app) private var appConfigJSON = ""
    @State private var markupConfiguration: MarkupWKWebViewConfiguration
    @State private var configVersion = 0    // Used as id for MarkupEditorView to trigger redraw w/new toolbar
    @State private var appConfig: AppConfig = AppConfig.fromDefaults()
    @ScaledMetric(relativeTo: .title3) var iconSize: CGFloat = 22

    var body: some View {
        VStack(spacing: 0) {
            MarkupEditorView(markupDelegate: self, configuration: markupConfiguration, html: $initialHtml, placeholder: "Edit document...", id: "Document")
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
        .onChange(of: toolbarConfigJSON) { _, _ in
            markupConfiguration.toolbarConfig = ToolbarConfig.fromDefaults()
            MarkupEditor.selectedWebView?.getHtml { html in
                self.initialHtml = html ?? ""   // Restore contents on redraw
                self.configVersion += 1
            }
        }
        .onChange(of: appConfigJSON) { _, _ in
            appConfig = AppConfig.fromDefaults()
            MarkupEditor.selectedWebView?.getHtml { html in
                self.initialHtml = html ?? ""   // Restore contents on redraw
                self.configVersion += 1
            }
        }
        .onChange(of: keymapConfigJSON) { _, _ in
            markupConfiguration.keymapConfig = KeymapConfig.fromDefaults()
            MarkupEditor.selectedWebView?.getHtml { html in
                self.initialHtml = html ?? ""   // Restore contents on redraw
                self.configVersion += 1
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
        .onReceive(NotificationCenter.default.publisher(for: .menuOpenRecentDocument)) { notification in
            guard let url = notification.object as? URL else { return }
            checkSave { shouldProceed in
                guard shouldProceed else { return }
                openDocument(at: url)
            }
        }
        // Dismiss the SettingsView when this one will close
#if DEBUG
        .onReceive(NotificationCenter.default.publisher(for: .menuClearUserDefaults)) { _ in
            UserDefaults.standard.removeObject(forKey: ConfigKeys.toolbar)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.keymap)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.behavior)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.app)
        }
#endif
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { notification in
            NotificationCenter.default.post(name: .dismissSettings, object: nil)
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
        .toolbarRole(.editor)
        .toolbar(removing: .title)
        .toolbar {
            // Sidebar toggle: insert ToolbarItem(placement: .navigation) here when adding a sidebar.
            ToolbarItem(placement: .navigation) {
                HStack(alignment: .center, spacing: 4) {
                    if let url = currentFileURL {
                        Image(nsImage: NSWorkspace.shared.icon(forFile: url.path))
                            .resizable()
                            .scaledToFit()
                            .frame(width: iconSize, height: iconSize)
                    } else if let nsImage = AppDelegate.docIcon {
                        Image(nsImage: nsImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: iconSize, height: iconSize)
                    }
                    Text(currentFileURL?.lastPathComponent ?? "MarkupEditor")
                        .font(.title3)
                }
                .allowsHitTesting(false)
            }
            .sharedBackgroundVisibility(.hidden)
            ToolbarSpacer(.flexible)
            ToolbarItemGroup {
                if let url = currentFileURL {
                    ShareLink(item: url)
                }
                if (appConfig.isToggled()) {
                    // The button will only appear if the behavior is set to toggled. The behavior
                    // can change from the BehaviorSettingsView, handled in .onChange(of: appConfigJSON) above.
                    Button(action: {
                        let newVisible = !toolbarVisible()
                        // Toggle the appConfig setting
                        appConfig.toggledState = newVisible ? ToggledState.visible.rawValue : ToggledState.hidden.rawValue
                        // Then save it, which triggers the .onChange(of: appConfigJSON) above
                        if let json = appConfig.asJSON(), json != appConfigJSON {
                            appConfigJSON = json
                        } else {
                            assertionFailure("AppConfig encoding failed unexpectedly")
                        }
                        // Reset toolbarConfig inside of markupConfiguration so it displays properly initially
                        var toolbarConfig = markupConfiguration.toolbarConfig
                        toolbarConfig?.visibility["toolbar"] = newVisible
                        markupConfiguration.toolbarConfig = toolbarConfig
                        // Then save it, which triggers the .onChange(of: toolbarConfigJSON) above
                        if let toolbarConfig, let json = toolbarConfig.asJSON(), json != toolbarConfig.asJSON() {
                            toolbarConfigJSON = json
                        } else {
                            assertionFailure("ToolbarConfig encoding failed unexpectedly")
                        }
                        
                    }) {
                        Image(systemName: "inset.filled.topthird.rectangle")
                    }
                }
                Button(action: {
                    openSettings()
                }) {
                    Image(systemName: "gearshape")
                }
            }
        }
    }
    
    init() {
        // populateMarkupHtml runs synchronously inside makeNSView, before onAppear fires,
        // so stored overrides must be in markupConfiguration before the first render.
        let config = MarkupWKWebViewConfiguration()
        config.toolbarConfig = ToolbarConfig.fromDefaults()
        config.keymapConfig = KeymapConfig.fromDefaults()
        config.behaviorConfig = BehaviorConfig.fromDefaults()
        _markupConfiguration = State(initialValue: config)
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
            let srcs = localImageSrcs(in: html)
            if !srcs.isEmpty {
                // Open Recent provides a file-only security scope; resolve a stored parent-dir
                // bookmark to regain directory access for image copying.
                let scopedParent = resolveParentDirBookmark(for: fileURL)
                let accessingScoped = scopedParent?.startAccessingSecurityScopedResource() ?? false
                defer { if accessingScoped { scopedParent?.stopAccessingSecurityScopedResource() } }
                try copyImageAssets(srcs: srcs, from: parentDir, to: baseUrl, skipMissing: true)
                // Store/refresh the bookmark while we still have sandbox access to parentDir.
                storeParentDirBookmark(for: fileURL)
            }
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
    
    func toolbarVisible() -> Bool {
        !appConfig.isHidden()
    }

}

extension MarkupDocumentView: MarkupDelegate {
    
    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        view.setToolbarVisible(toolbarVisible())
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
    MarkupDocumentView()
}
