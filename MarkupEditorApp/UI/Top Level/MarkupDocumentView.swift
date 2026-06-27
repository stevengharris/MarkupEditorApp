//
//  MarkupDocumentView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
import SplitView

internal import UniformTypeIdentifiers

private extension UTType {
    static let htmd = UTType("com.stevengharris.htmd") ?? .data
}

struct MarkupDocumentView: View {

    typealias ConfigKeys = AppConfig.ConfigKey
    typealias ToggledState = AppConfig.ToggledState

    @Environment(ImportLog.self) private var importLog
    @Environment(\.openSettings) private var openSettings

    @ObservedObject var selectImage = MarkupEditor.selectImage

    @State private var initialHtml = ""     // Used to create a MarkupEditorView w/initial content
    @State private var currentSource = ""   // Used to display the raw HTML or imported document but avoid MarkupEditorView redrawing
    @State private var documentPickerShowing: Bool = false
    @State private var rawShowing: Bool = false
    @State var sourceViewIsStale: Bool = false
    @State private var document = MarkupDocument()

    @State private var infoHide = SideHolder.usingUserDefaults(key: "infoHide")
    let docFraction = FractionHolder.usingUserDefaults(0.75, key: "docFraction")

    @AppStorage(ConfigKeys.toolbar) private var toolbarConfigJSON = ""
    @AppStorage(ConfigKeys.keymap) private var keymapConfigJSON = ""
    @AppStorage(ConfigKeys.behavior) private var behaviorConfigJSON = ""
    @AppStorage(ConfigKeys.app) private var appConfigJSON = ""
    @State private var markupConfiguration: MarkupWKWebViewConfiguration
    @State private var configVersion = 0    // Used as id for MarkupEditorView to trigger redraw w/new toolbar
    @State private var appConfig: AppConfig = AppConfig.fromDefaults()
    @ScaledMetric(relativeTo: .title3) var iconSize: CGFloat = 22

    var body: some View {
        @Bindable var doc = document
        HSplit(
            left: {
                VStack(spacing: 0) {
                    Divider()
                    MarkupEditorView(markupDelegate: self, configuration: markupConfiguration, html: $initialHtml, placeholder: "Edit document...", id: "Document")
                        .id(configVersion)
                    if rawShowing {
                        SourceView(
                            currentSource: $currentSource,
                            sourceViewIsStale: $sourceViewIsStale,
                            pluginLabel: pluginLabel(for: document.currentFileURL),
                            onRefresh: refreshSourceView
                        )
                    }
                }
            },
            right: {
                InfoView(url: $doc.currentFileURL, metadataInfo: $doc.metadata)
            }
        )
        .fraction(docFraction)
        .hide(infoHide)
        .styling(inset: 0, visibleThickness: 1, hideSplitter: true)
        .onChange(of: toolbarConfigJSON) { _, _ in
            markupConfiguration.toolbarConfig = ToolbarConfig.fromDefaults()
            reloadEditorForConfigChange()
        }
        .onChange(of: appConfigJSON) { _, _ in
            appConfig = AppConfig.fromDefaults()
            markupConfiguration.pluginFiles = AppConfig.pluginFiles(
                from: appConfig.plugins,
                pluginDir: PluginSetup.defaultPluginDir
            )
            reloadEditorForConfigChange()
        }
        .onChange(of: keymapConfigJSON) { _, _ in
            markupConfiguration.keymapConfig = KeymapConfig.fromDefaults()
            reloadEditorForConfigChange()
        }
        // Consolidate menu items into a single .task modifier
        .task {
            let names: [Notification.Name] = [
                .menuNewDocument, .menuOpenDocument, .menuSaveDocument,
                .menuSaveAsDocument, .menuShowSource, .menuShowSettings,
                .menuOpenRecentDocument, .menuExportPlugin,
                .menuQuitApplication, NSWindow.willCloseNotification,
            ]
            await withTaskGroup(of: Void.self) { group in
                for name in names {
                    group.addTask { @MainActor in
                        for await notification in NotificationCenter.default.notifications(named: name) {
                            handleMenuNotification(notification)
                        }
                    }
                }
            }
        }
#if DEBUG
        .task {
            for await _ in NotificationCenter.default.notifications(named: .menuClearUserDefaults) {
                let ud = UserDefaults.standard
                ud.removeObject(forKey: ConfigKeys.toolbar)
                ud.removeObject(forKey: ConfigKeys.keymap)
                ud.removeObject(forKey: ConfigKeys.behavior)
                ud.removeObject(forKey: ConfigKeys.app)
                for key in ud.dictionaryRepresentation().keys where key.hasPrefix("parentDirBookmark:") {
                    ud.removeObject(forKey: key)
                }
            }
        }
        .task {
            for await _ in NotificationCenter.default.notifications(named: .menuClearCacheDir) {
                guard let cacheUrl = MarkupEditor.selectedWebView?.baseUrl else { return }
                let alert = NSAlert()
                alert.messageText = "Clear all files in \(cacheUrl.path(percentEncoded: false))?"
                alert.addButton(withTitle: "Clear")
                alert.addButton(withTitle: "Cancel")
                alert.alertStyle = .warning
                let response = alert.runModal()
                switch response {
                case .alertFirstButtonReturn:
                    do {
                        try FileManager.default.contentsOfDirectory(at: cacheUrl, includingPropertiesForKeys: nil)
                            .forEach { try FileManager.default.removeItem(at: $0) }
                    } catch let error {
                        print("Error: \(error.localizedDescription)")
                    }
                default:
                    return
                }
            }
        }
#endif
        .onOpenURL { url in
            if MarkupEditor.selectedWebView != nil {
                AppDelegate.pendingFinderURL = nil
                checkSave { shouldProceed in
                    guard shouldProceed else { return }
                    Task { await openDocument(at: url) }
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
                Task { await openDocument(at: url) }
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
            AppToolbarView(
                currentFileURL: $doc.currentFileURL,
                appConfig: $appConfig,
                appConfigJSON: $appConfigJSON,
                toolbarConfigJSON: $toolbarConfigJSON,
                markupConfiguration: $markupConfiguration,
                infoHide: $infoHide
            )
        }
    }

    init() {
        // populateMarkupHtml runs synchronously inside makeNSView, before onAppear fires,
        // so stored overrides must be in markupConfiguration before the first render.
        let config = MarkupWKWebViewConfiguration()
        config.toolbarConfig = ToolbarConfig.fromDefaults()
        config.keymapConfig = KeymapConfig.fromDefaults()
        config.behaviorConfig = BehaviorConfig.fromDefaults()
        config.userScriptFile = "markup-editor-markdown.js"
        config.pluginFiles = AppConfig.pluginFiles(
            from: AppConfig.fromDefaults().plugins,
            pluginDir: PluginSetup.defaultPluginDir
        )
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

    private func setCurrentSource(_ handler: (()->Void)? = nil) {
        MarkupEditor.selectedWebView?.getHtml { html in
            currentSource = html ?? ""
            sourceViewIsStale = false
            handler?()
        }
    }

    // Fetches current HTML and bumps configVersion, forcing MarkupEditorView to redraw via .id(configVersion).
    private func reloadEditorForConfigChange() {
        MarkupEditor.selectedWebView?.getHtml { html in
            self.initialHtml = html ?? ""
            self.configVersion += 1
        }
    }

    private func finalizeOpen(url: URL, handler: (()->Void)?) {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        setCurrentSource {
            initialHtml = currentSource
            setRepresentedURL(url)
            handler?()
        }
    }

    private func showAlert(_ message: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
    }

    private func imageSelected(url: URL) {
        guard let selectedWebView = MarkupEditor.selectedWebView else { return }
        markupImageToAdd(selectedWebView, url: url)
    }

    // MARK: - File operations (driven by menu notifications on macOS)

    private func handleNew() {
        checkSave { [self] shouldProceed in
            guard shouldProceed else { return }
            MarkupEditor.selectedWebView?.emptyDocument {
                setCurrentSource()
            }
            initialHtml = currentSource
            setRepresentedURL(nil)
            document.reset()
        }
    }

    private func handleQuit() {
        checkSave { shouldProceed in
            if AppDelegate.isRespondingToTerminateQuery {
                // Cmd+Q path: applicationShouldTerminate returned .terminateLater
                AppDelegate.isRespondingToTerminateQuery = false
                NSApp.reply(toApplicationShouldTerminate: shouldProceed)
            } else if shouldProceed {
                // Close-button path: window is still open; terminate now
                AppDelegate.skipTerminateCheck = true
                NSApp.terminate(nil)
            }
            // Close-button cancel: window stays open, nothing to do
        }
    }

    private func handleMenuNotification(_ notification: Notification) {
        switch notification.name {
        case .menuNewDocument:
            handleNew()
        case .menuOpenDocument:
            handleOpen()
        case .menuSaveDocument:
            handleSave()
        case .menuSaveAsDocument:
            handleSaveAs()
        case .menuShowSource:
            handleShowSource()
        case .menuShowSettings:
            openSettings()
        case .menuOpenRecentDocument:
            guard let url = notification.object as? URL else { return }
            handleOpenRecent(url: url)
        case .menuExportPlugin:
            guard let pluginName = notification.userInfo?["name"] as? String else { return }
            let fileExt = notification.userInfo?["fileExtension"] as? String ?? ""
            handleExport(pluginName: pluginName, fileExt: fileExt)
        case .menuQuitApplication:
            handleQuit()
        case NSWindow.willCloseNotification:
            NotificationCenter.default.post(name: .dismissSettings, object: nil)
        default:
            break
        }
    }
    
    private func handleOpen() {
        checkSave { shouldProceed in
            guard shouldProceed else { return }
            let panel = NSOpenPanel()
            panel.allowedContentTypes = DocumentType.utTypes()
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = true
            panel.canChooseFiles = true
            guard panel.runModal() == .OK, let url = panel.url else { return }
            if url.pathExtension.lowercased() == "md",
               let content = try? String(contentsOf: url, encoding: .utf8),
               !localImageSrcsInMarkdown(content).isEmpty,
               resolveParentDirBookmark(for: url) == nil {
                // NSOpenPanel's powerbox grant implicitly extends to the parent directory for
                // web-content UTIs (public.html, .htmd), but NOT for public.plain-text (.md).
                // Confirmed empirically: FileManager.contentsOfDirectory on the parent succeeds
                // synchronously after selecting .html but fails with a sandbox denial after .md.
                // Request explicit directory access via a second panel so images can be cached.
                // Skipped when a bookmark for this directory is already stored from a prior open.
                let dirPanel = NSOpenPanel()
                dirPanel.canChooseFiles = false
                dirPanel.canChooseDirectories = true
                dirPanel.directoryURL = url.deletingLastPathComponent()
                dirPanel.prompt = "Grant Access"
                dirPanel.message = "This document references images. Grant read access to the containing folder to display them."
                if dirPanel.runModal() == .OK, let dirURL = dirPanel.url {
                    storeParentDirBookmark(for: url, using: dirURL)
                }
            } else {
                storeParentDirBookmark(for: url)
            }
            Task { await openDocument(at: url) }
        }
    }
    
    //MARK: Shared functions
    
    /// Present a save/discard/cancel alert if the document has unsaved changes.
    /// Calls the completion with true to proceed, false to cancel.
    private func checkSave(then proceed: @escaping (Bool) -> Void) {
        guard document.hasChanges else {
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
            document.hasChanges = false
            proceed(true)
        default:
            proceed(false)
        }
    }

    //MARK: Opening files
    
    private func openDocument(at url: URL, handler: (()->Void)? = nil) async {
        let ext = url.pathExtension.lowercased()
        guard let docType = DocumentType.forExt(ext) else {
            let supported = DocumentType.exts().joined(separator: ", ")
            let alert = NSAlert()
            alert.messageText = "Unsupported file type"
            alert.informativeText = "Only \(supported) documents can be opened."
            alert.runModal()
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            switch docType {
            case .html:
                try openHtml(at: url, handler: handler)
            case .md:
                try openMd(at: url, handler: handler)
            case .htmd:
                try openHtmd(at: url, handler: handler)
            }
        } catch let error {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    private func openHtmd(at packageURL: URL, handler: (()->Void)? = nil) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw DocumentOpenError.noWebViewAvailable
        }
        let html = try document.openHtmd(at: packageURL, baseUrl: webView.baseUrl)
        webView.setHtml(html)
        finalizeOpen(url: packageURL, handler: handler)
    }

    private func openHtml(at fileURL: URL, handler: (()->Void)? = nil) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw DocumentOpenError.noWebViewAvailable
        }
        let html = try document.openHtml(at: fileURL, baseUrl: webView.baseUrl)
        webView.setHtml(html)
        finalizeOpen(url: fileURL, handler: handler)
    }
    
    private func openMd(at url: URL, handler: (()->Void)? = nil) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw DocumentOpenError.noWebViewAvailable
        }
        let fileContent: String
        do {
            importLog.info("Opening \(url.path())")
            fileContent = try String(contentsOf: url, encoding: .utf8)
        } catch {
            showAlert("Could not read file: \(error.localizedDescription)")
            handler?()
            return
        }
        webView.importMarkdown(content: fileContent) { result in
            guard let pluginResult = PluginResult.decode(from: result) else {
                showAlert("Unexpected response.")
                handler?()
                return
            }
            guard let html = pluginResult.result else {
                showAlert("Could not convert to HTML.")
                handler?()
                return
            }
            var warnings = pluginResult.warnings
            let metadata: [MetadataTuple]
            if let yamlString = pluginResult.metadata {
                metadata = parseYAMLMetadata(yamlString, warnings: &warnings)
            } else {
                metadata = []
            }
            importLog.warnings(warnings)
            do {
                try document.openMd(at: url, baseUrl: webView.baseUrl, html: html, metadata: metadata)
                MarkupEditor.selectedWebView?.setHtml(html)
                finalizeOpen(url: url, handler: handler)
            } catch let error {
                showAlert("Could not prepare file: \(error.localizedDescription)")
                handler?()
                return
            }
        }
    }

    //MARK: Saving
    
    private func handleSave(then completion: (()->Void)? = nil) {
        guard let url = document.currentFileURL else {
            showSavePanel(then: completion)
            return
        }
        guard MarkupEditor.selectedWebView?.baseUrl != nil else {
            completion?()
            return
        }
        let ext = url.pathExtension.lowercased()
        // Plugin save is async (plugin-driven); handle it before the image-sync path.
        if let pluginName = pluginName(forExtension: ext) {
            MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: nil) { result in
                guard let pluginResult = PluginResult.decode(from: result),
                      let pluginOutput = pluginResult.result else {
                    showAlert("Export failed.")
                    completion?()
                    return
                }
                let output = document.injectYAMLFrontMatter(into: pluginOutput)
                do {
                    try output.write(to: url, atomically: true, encoding: .utf8)
                    self.document.hasChanges = false
                    completion?()
                } catch {
                    showAlert("Failed to write file: \(error.localizedDescription)")
                    completion?()
                }
            }
            return
        }
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
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
                    try document.save(html: html, srcs: srcs, baseUrl: baseUrl)
                    completion?()
                } catch {
                    let alert = NSAlert(error: error)
                    alert.runModal()
                    completion?()
                }
            }
        }
    }

    /// Refreshes the source view content based on the active document type.
    ///
    /// For `.html` and `.htmd`, delegates to `setCurrentSource()` which fetches raw HTML
    /// and clears `sourceViewIsStale`. For `.md`, invokes the registered plugin's `export`
    /// action to convert the current editor HTML to the plugin's source format, then updates
    /// `currentSource` with the result and clears `sourceViewIsStale`. The plugin is resolved
    /// from the current file URL's extension.
    private func refreshSourceView() {
        let ext = document.currentFileURL?.pathExtension.lowercased() ?? ""
        if let pluginName = pluginName(forExtension: ext) {
            MarkupEditor.selectedWebView?.getHtml { html in
                guard let html else {
                    self.sourceViewIsStale = false
                    return
                }
                MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: html) { result in
                    if let pluginResult = PluginResult.decode(from: result),
                       let pluginOutput = pluginResult.result {
                        currentSource = pluginOutput
                    }
                    self.sourceViewIsStale = false
                }
            }
        } else {
            setCurrentSource()
        }
    }

    /// Toggles the source view. Triggers a content refresh when opening.
    private func handleShowSource() {
        let isOpening = !rawShowing
        withAnimation(.easeInOut(duration: 0.25)) { rawShowing.toggle() }
        if isOpening { refreshSourceView() }
    }

    private func handleOpenRecent(url: URL) {
        checkSave { shouldProceed in
            guard shouldProceed else { return }
            Task { await openDocument(at: url) }
        }
    }

    private func handleExport(pluginName: String, fileExt: String) {
        let panel = NSSavePanel()
        let baseName = document.currentFileURL?.deletingPathExtension().lastPathComponent ?? "Untitled"
        panel.nameFieldStringValue = fileExt.isEmpty ? baseName : "\(baseName).\(fileExt)"
        panel.allowedContentTypes = MarkupDocumentView.allowedContentTypes(forExt: fileExt)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: nil) { result in
            guard let pluginResult = PluginResult.decode(from: result),
                  let pluginOutput = pluginResult.result else {
                showAlert("Plugin '\(pluginName)' could not complete the operation.")
                return
            }
            let output = document.injectYAMLFrontMatter(into: pluginOutput)
            do {
                try output.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                showAlert("Failed to write file: \(error.localizedDescription)")
            }
        }
    }

    /// Replaces the editor content with the imported file's converted HTML.
    /// Document identity (URL, type, hasChanges) is intentionally left unchanged — use Open to change identity.
    private func handleImport(pluginName: String, fileExt: String) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = MarkupDocumentView.allowedContentTypes(forExt: fileExt)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        importLog.info("Importing \(url.path())")
        guard let fileContent = try? String(contentsOf: url, encoding: .utf8) else {
            showAlert("Could not read file.")
            return
        }
        MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "import", content: fileContent) { result in
            guard let pluginResult = PluginResult.decode(from: result),
                  let html = pluginResult.result else {
                showAlert("Plugin '\(pluginName)' could not complete the operation.")
                return
            }
            MarkupEditor.selectedWebView?.setHtml(html)
            initialHtml = html
            currentSource = html
        }
    }

    private func handleSaveAs() {
        showSavePanel()
    }

    private func showSavePanel(then completion: (()->Void)? = nil) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.html, .htmd] + pluginContentTypes()
        panel.nameFieldStringValue = document.currentFileURL?.lastPathComponent ?? "Untitled.htmd"
        guard panel.runModal() == .OK, let url = panel.url else {
            completion?()
            return
        }
        guard MarkupEditor.selectedWebView?.baseUrl != nil else {
            completion?()
            return
        }
        let targetExt = url.pathExtension.lowercased()
        guard targetExt == "html" || targetExt == "htmd" || pluginName(forExtension: targetExt) != nil else {
            completion?()
            return
        }
        // Plugin save-as is async (plugin-driven); handle it before the image-scan path.
        if let pluginName = pluginName(forExtension: targetExt) {
            MarkupEditor.selectedWebView?.getHtml { html in
                guard let html else { completion?(); return }
                MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: html) { result in
                    guard let pluginResult = PluginResult.decode(from: result),
                          let pluginOutput = pluginResult.result else {
                        showAlert("Export failed.")
                        completion?()
                        return
                    }
                    do {
                        let output = document.injectYAMLFrontMatter(into: pluginOutput)
                        try output.write(to: url, atomically: true, encoding: .utf8)
                        self.document.willSaveTo(url: url, fileExtension: targetExt)
                        self.setRepresentedURL(url)
                        NSDocumentController.shared.noteNewRecentDocumentURL(url)
                        completion?()
                    } catch {
                        showAlert("Failed to write file: \(error.localizedDescription)")
                        completion?()
                    }
                }
            }
            return
        }
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
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
                        try document.saveHtmd(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
                    default:
                        try document.saveHtml(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
                    }
                    document.willSaveTo(url: url, fileExtension: targetExt)
                    NSDocumentController.shared.noteNewRecentDocumentURL(url)
                    setRepresentedURL(url)
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

    /// Returns the JS registry key for the plugin registered for `ext`, or `nil` if none.
    private func pluginName(forExtension ext: String) -> String? {
        appConfig.plugins?.first(where: { $0.fileExtension == ext })?.name
    }

    private func pluginLabel(for url: URL?) -> String? {
        guard let ext = url?.pathExtension.lowercased() else { return nil }
        return appConfig.plugins?.first(where: { $0.fileExtension == ext })?.name
    }

    static func allowedContentTypes(forExt ext: String) -> [UTType] {
        UTType(filenameExtension: ext).map { [$0] } ?? []
    }

    static func pluginContentTypes(for plugins: [AppConfig.PluginConfigEntry]) -> [UTType] {
        plugins.compactMap { $0.fileExtension.flatMap { UTType(filenameExtension: $0) } }
    }

    private func pluginContentTypes() -> [UTType] {
        MarkupDocumentView.pluginContentTypes(for: appConfig.plugins ?? [])
    }

}

extension MarkupDocumentView: MarkupDelegate {

    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        view.setToolbarVisible(toolbarVisible())
        if let url = AppDelegate.consumePendingURL() {
            Task { await openDocument(at: url, handler: handler) }
        } else {
            setCurrentSource(handler)
        }
    }

    func markupInput(_ view: MarkupWKWebView) {
        document.hasChanges = true
        view.getSelectionState() { selectionState in
            MarkupEditor.selectionState.reset(from: selectionState)
            sourceViewIsStale = true
        }
    }

    /// In the MacOS version, which uses the markupeditor-base toolbar, pressing the Select... button in the insert
    /// image dialog calls back to the messageHandler (i.e., the MarkupCoordinator) with `selectImage`, which
    /// in turn invokes the delegate's `markupSelectImage` method. We trigger the dialog by toggling the
    /// value of   selectImage .
    func markupSelectImage(_ view: MarkupWKWebView?) {
        selectImage.value.toggle()
    }

    func markupPluginsDidLoad(_ view: MarkupWKWebView, plugins: [[String: String]]) {
        guard let appDelegate = NSApplication.shared.delegate as? AppDelegate else { return }
        let entries = plugins.compactMap { dict -> AppConfig.PluginConfigEntry? in
            // Manifest shape from JS: { name, extension } — no "id" or "filename" key.
            // "name" is the JS registry key passed to invokePlugin.
            // "extension" (JS key) is bridged here to fileExtension (Swift field).
            guard let name = dict["name"] else { return nil }
            let fileExtension = dict["extension"]
            return AppConfig.PluginConfigEntry(name: name, filename: name, fileExtension: fileExtension)
        }
        appDelegate.populatePluginMenus(entries)
    }

}

#Preview {
    MarkupDocumentView()
        .environment(ImportLog())
}
