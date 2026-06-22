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
                            docType: document.activeDocumentType,
                            onRefresh: refreshSourceView
                        )
                    }
                }
            },
            right: {
                InfoView(url: $doc.currentFileURL, metadataInfo: $doc.documentMetadata)
            }
        )
        .fraction(docFraction)
        .hide(infoHide)
        .styling(inset: 0, visibleThickness: 1, hideSplitter: true)
        .onChange(of: toolbarConfigJSON) { _, _ in
            markupConfiguration.toolbarConfig = ToolbarConfig.fromDefaults()
            MarkupEditor.selectedWebView?.getHtml { html in
                self.initialHtml = html ?? ""   // Restore contents on redraw
                self.configVersion += 1
            }
        }
        .onChange(of: appConfigJSON) { _, _ in
            appConfig = AppConfig.fromDefaults()
            markupConfiguration.pluginFiles = AppConfig.pluginFiles(
                from: appConfig.plugins,
                pluginDir: PluginSetup.defaultPluginDir
            )
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
        .onReceive(NotificationCenter.default.publisher(for: .menuShowSource)) { _ in
            handleShowSource()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuShowSettings)) { _ in
            openSettings()
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuOpenRecentDocument)) { notification in
            guard let url = notification.object as? URL else { return }
            handleOpenRecent(url: url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuExportPlugin)) { notification in
            guard let pluginName = notification.userInfo?["name"] as? String else { return }
            let fileExt = notification.userInfo?["fileExtension"] as? String ?? ""
            handleExport(pluginName: pluginName, fileExt: fileExt)
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuImportPlugin)) { notification in
            guard let pluginName = notification.userInfo?["name"] as? String else { return }
            let fileExt = notification.userInfo?["fileExtension"] as? String ?? ""
            handleImport(pluginName: pluginName, fileExt: fileExt)
        }
        .onReceive(NotificationCenter.default.publisher(for: .menuQuitApplication)) { _ in
            handleQuit()
        }
#if DEBUG
        .onReceive(NotificationCenter.default.publisher(for: .menuClearUserDefaults)) { _ in
            UserDefaults.standard.removeObject(forKey: ConfigKeys.toolbar)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.keymap)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.behavior)
            UserDefaults.standard.removeObject(forKey: ConfigKeys.app)
        }
#endif
        // Dismiss the SettingsView when this one will close
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

    private func handleOpen() {
        checkSave { shouldProceed in
            guard shouldProceed else { return }
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.html, .htmd, UTType("public.markdown") ?? .plainText]
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = true
            panel.canChooseFiles = true
            guard panel.runModal() == .OK, let url = panel.url else { return }
            openDocument(at: url)
        }
    }

    private func openDocument(at url: URL, handler: (()->Void)? = nil) {
        let ext = url.pathExtension.lowercased()
        guard ext == "html" || ext == "htmd" || ext == "md" else {
            let alert = NSAlert()
            alert.messageText = "Unsupported file type"
            alert.informativeText = "Only .html, .htmd, and .md documents can be opened."
            alert.runModal()
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        if ext == "md" {
            guard let pluginName = pluginName(forExtension: "md") else {
                let alert = NSAlert()
                alert.messageText = "No plugin available for .md files."
                alert.runModal()
                handler?()
                return
            }
            let fileContent: String
            do {
                importLog.info("Importing \(url.path())")
                fileContent = try String(contentsOf: url, encoding: .utf8)
            } catch {
                let alert = NSAlert()
                alert.messageText = "Could not read file: \(error.localizedDescription)"
                alert.runModal()
                handler?()
                return
            }
            MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "import", content: fileContent) { result in
                guard let pluginResult = PluginResult.decode(from: result) else {
                    let alert = NSAlert()
                    alert.messageText = "Plugin returned an unexpected response."
                    alert.runModal()
                    handler?()
                    return
                }
                if !pluginResult.warnings.isEmpty {
                    let alert = NSAlert()
                    alert.messageText = pluginResult.warnings.joined(separator: "\n")
                    alert.runModal()
                }
                var yamlWarnings: [String] = []   // YAML parse warnings suppressed for now; surface in a future pass
                let metadata: [MetadataTuple]
                if let yamlString = pluginResult.metadata {
                    metadata = parseYAMLMetadata(yamlString, warnings: &yamlWarnings)
                } else {
                    metadata = []
                }
                guard let html = pluginResult.result else {
                    let alert = NSAlert()
                    alert.messageText = "Plugin could not convert the file."
                    alert.runModal()
                    handler?()
                    return
                }
                MarkupEditor.selectedWebView?.setHtml(html)
                self.document.setOpenResult(html: html, url: url, type: .md, metadata: metadata)
                self.setCurrentSource {
                    self.initialHtml = self.currentSource
                    self.setRepresentedURL(url)
                    NSDocumentController.shared.noteNewRecentDocumentURL(url)
                    handler?()
                }
            }
            return
        }
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
        let result = try document.openHtmd(at: packageURL, baseUrl: baseUrl)
        MarkupEditor.selectedWebView?.setHtml(result.html)
        NSDocumentController.shared.noteNewRecentDocumentURL(packageURL)
        document.setOpenResult(html: result.html, url: packageURL, type: .htmd, metadata: result.metadata, rootHtmlFilename: result.rootHtmlFilename)
        setCurrentSource() {
            initialHtml = currentSource
            setRepresentedURL(packageURL)
            handler?()
        }
    }

    private func openHtml(at fileURL: URL, handler: (()->Void)? = nil) throws {
        guard let baseUrl = MarkupEditor.selectedWebView?.baseUrl else {
            throw DocumentOpenError.noWebviewAvailable
        }
        let html = try document.openHtml(at: fileURL, baseUrl: baseUrl)
        MarkupEditor.selectedWebView?.setHtml(html)
        NSDocumentController.shared.noteNewRecentDocumentURL(fileURL)
        document.setOpenResult(html: html, url: fileURL, type: .html, metadata: [])
        setCurrentSource() {
            initialHtml = currentSource
            setRepresentedURL(fileURL)
            handler?()
        }
    }


    private func handleSave(then completion: (()->Void)? = nil) {
        guard let url = document.currentFileURL else {
            showSavePanel(then: completion)
            return
        }
        guard MarkupEditor.selectedWebView?.baseUrl != nil else {
            completion?()
            return
        }
        let docType = document.activeDocumentType ?? .html
        // Markdown save is async (plugin-driven); handle it before the image-sync path.
        if docType == .md {
            guard let pluginName = pluginName(forExtension: "md") else {
                let alert = NSAlert()
                alert.messageText = "No plugin available for .md files."
                alert.runModal()
                completion?()
                return
            }
            MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: nil) { result in
                guard let pluginResult = PluginResult.decode(from: result),
                      let pluginOutput = pluginResult.result else {
                    let alert = NSAlert()
                    alert.messageText = "Export failed."
                    alert.runModal()
                    completion?()
                    return
                }
                var output = pluginOutput
                if !self.document.documentMetadata.isEmpty {
                    let yaml = serializeYAMLMetadata(self.document.documentMetadata)
                    output = "---\n\(yaml)---\n\n\(pluginOutput)"
                }
                do {
                    try output.write(to: url, atomically: true, encoding: .utf8)
                    self.document.hasChanges = false
                    completion?()
                } catch {
                    let alert = NSAlert()
                    alert.messageText = "Failed to write file: \(error.localizedDescription)"
                    alert.runModal()
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
    /// and clears `sourceViewIsStale`. For `.md`, invokes the registered Markdown plugin's
    /// `export` action to convert the current editor HTML to Markdown, then updates
    /// `currentSource` with the result and clears `sourceViewIsStale`.
    private func refreshSourceView() {
        guard let docType = document.activeDocumentType else {
            setCurrentSource()
            return
        }
        switch docType {
        case .html, .htmd:
            setCurrentSource()
        case .md:
            guard let pluginName = pluginName(forExtension: "md") else {
                sourceViewIsStale = false
                return
            }
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
            openDocument(at: url)
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
                let alert = NSAlert()
                alert.messageText = "Plugin '\(pluginName)' could not complete the operation."
                alert.runModal()
                return
            }
            var output = pluginOutput
            if !self.document.documentMetadata.isEmpty {
                let yaml = serializeYAMLMetadata(self.document.documentMetadata)
                output = "---\n\(yaml)---\n\n\(pluginOutput)"
            }
            do {
                try output.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                let alert = NSAlert()
                alert.messageText = "Failed to write file: \(error.localizedDescription)"
                alert.runModal()
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
            let alert = NSAlert()
            alert.messageText = "Could not read file."
            alert.runModal()
            return
        }
        MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "import", content: fileContent) { result in
            guard let pluginResult = PluginResult.decode(from: result),
                  let html = pluginResult.result else {
                let alert = NSAlert()
                alert.messageText = "Plugin '\(pluginName)' could not complete the operation."
                alert.runModal()
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
        panel.allowedContentTypes = [.html, .htmd, UTType("public.markdown") ?? .plainText]
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
        guard targetExt == "html" || targetExt == "htmd" || targetExt == "md" else {
            completion?()
            return
        }
        // Markdown save-as is async (plugin-driven); handle it before the image-scan path.
        if targetExt == "md" {
            guard let pluginName = pluginName(forExtension: "md") else {
                let alert = NSAlert()
                alert.messageText = "No plugin available for .md files."
                alert.runModal()
                completion?()
                return
            }
            MarkupEditor.selectedWebView?.getHtml { html in
                guard let html else { completion?(); return }
                MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: html) { result in
                    guard let pluginResult = PluginResult.decode(from: result),
                          let pluginOutput = pluginResult.result else {
                        let alert = NSAlert()
                        alert.messageText = "Export failed."
                        alert.runModal()
                        completion?()
                        return
                    }
                    do {
                        var output = pluginOutput
                        if !self.document.documentMetadata.isEmpty {
                            let yaml = serializeYAMLMetadata(self.document.documentMetadata)
                            output = "---\n\(yaml)---\n\n\(pluginOutput)"
                        }
                        try output.write(to: url, atomically: true, encoding: .utf8)
                        self.document.willSaveTo(url: url, as: .md)
                        self.setRepresentedURL(url)
                        NSDocumentController.shared.noteNewRecentDocumentURL(url)
                        completion?()
                    } catch {
                        let alert = NSAlert()
                        alert.messageText = "Failed to write file: \(error.localizedDescription)"
                        alert.runModal()
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
                    document.willSaveTo(url: url, as: targetExt == "htmd" ? .htmd : .html)
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

    static func allowedContentTypes(forExt ext: String) -> [UTType] {
        UTType(filenameExtension: ext).map { [$0] } ?? []
    }

}

extension MarkupDocumentView: MarkupDelegate {

    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        view.setToolbarVisible(toolbarVisible())
        if let url = AppDelegate.consumePendingURL() {
            openDocument(at: url, handler: handler)
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
