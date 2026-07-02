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
    
    @Environment(EditLog.self) private var editLog
    @Environment(\.openSettings) private var openSettings
    
    @ObservedObject var selectImage = MarkupEditor.selectImage
    
    @State private var currentHtml = ""             // HTML for the MarkupEditorView when it starts or refreshes
    @State private var currentSource: String = ""   // HTML or Markdown that is shown in SourceView
    @State private var documentPickerShowing: Bool = false
    @State private var rawShowing: Bool = false
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
        //let _ = Self._printChanges()
        @Bindable var doc = document
        HSplit(
            left: {
                VStack(spacing: 0) {
                    if rawShowing {
                        SourceView(
                            document: $document,
                            currentSource: $currentSource
                        )
                    } else {
                        MarkupEditorView(
                            markupDelegate: self,
                            configuration: markupConfiguration,
                            html: $currentHtml,
                            placeholder: "Edit document...",
                            id: "Document"
                        )
                        .id(configVersion)
                    }
                }
            },
            right: {
                InfoView(url: $doc.url, metadataInfo: $doc.metadata)
            }
        )
        .fraction(docFraction)
        .hide(infoHide)
        .styling(inset: 0, visibleThickness: 1, hideSplitter: true)
        .onChange(of: rawShowing) { _, showing in
            if showing {
                // Set the currentSource shown in the SourceView based on the document's source
                currentSource = document.source
            } else {
                // Set the currentHtml and update the document based on currentSource updated in SourceView
                if document.isHTMLish {
                    currentHtml = currentSource
                    document.setSource(currentSource)
                } else {
                    getHTML(from: currentSource) { html in
                        guard let html else { return }
                        currentHtml = html
                        document.setSource(currentSource)
                    }
                }
            }
        }
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
                .menuSaveAsDocument, .menuToggleSource, .menuShowSettings,
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
                checkSave {
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
                url: $doc.url,
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
        guard let webView = MarkupEditor.selectedWebView else { completion([]); return }
        webView.getLocalImages(handler: completion)
    }
    
    // Fetches current HTML and bumps configVersion, forcing MarkupEditorView to redraw via .id(configVersion).
    private func reloadEditorForConfigChange() {
        MarkupEditor.selectedWebView?.getHtml { html in
            self.currentHtml = html ?? ""
            self.configVersion += 1
        }
    }
    
    // Keep track of the URL we are working on in recentDocuments and show in the window title bar
    private func track(url: URL, handler: (()->Void)? = nil) {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        NSApplication.shared.mainWindow?.representedURL = url
        handler?()
    }
    
    /// For now, just show an error in the log, but in longer run, show notification breadcrumbs
    private func showError(_ message: String) {
        editLog.error(message)
    }
    
    private func imageSelected(url: URL) {
        guard let selectedWebView = MarkupEditor.selectedWebView else { return }
        markupImageToAdd(selectedWebView, url: url)
    }
    
    // MARK: - File operations (driven by menu notifications on macOS)
    
    private func handleNew() {
        guard let webView = MarkupEditor.selectedWebView else { return }
        checkSave {
            webView.emptyDocument {
                webView.getHtml { html in
                    guard let html else { return }
                    document.setSource(html, documentType: .html)
                    currentHtml = document.source
                    NSApplication.shared.mainWindow?.representedURL = nil
                    document.reset()
                }
            }
        }
    }
    
    private func handleQuit() {
        checkSave {
            if AppDelegate.isRespondingToTerminateQuery {
                // Cmd+Q path: applicationShouldTerminate returned .terminateLater
                AppDelegate.isRespondingToTerminateQuery = false
                NSApp.reply(toApplicationShouldTerminate: true)
                return
            } else {
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
        case .menuToggleSource:
            handleToggleSource()
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
        checkSave {
            let panel = NSOpenPanel()
            panel.allowedContentTypes = DocumentType.utTypes()
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = true
            panel.canChooseFiles = true
            guard panel.runModal() == .OK, let url = panel.url else { return }
            if url.pathExtension.lowercased() == "md",
               let content = try? String(contentsOf: url, encoding: .utf8),
               !document.localImageSrcsInMarkdown(content).isEmpty,
               document.resolveParentDirBookmark(for: url) == nil {
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
                    document.storeParentDirBookmark(for: url, using: dirURL)
                }
            } else {
                document.storeParentDirBookmark(for: url)
            }
            Task { await openDocument(at: url) }
        }
    }
    
    //MARK: Shared functions
    
    /// Present a save/discard/cancel alert if the document has unsaved changes.
    /// Calls the completion with true to proceed, false to cancel.
    private func checkSave(then proceed: () -> Void) {
        guard document.hasChanges else {
            proceed()
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
            proceed()
        case .alertSecondButtonReturn:
            document.hasChanges = false
            proceed()
        default:
            return
        }
    }
    
    func setHTML(_ html: String?) throws {
        guard let html, let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        webView.setHtml(html)
        currentHtml = html
    }
    
    //MARK: Opening files
    
    private func openDocument(at url: URL, handler: (()->Void)? = nil) async {
        guard let docType = DocumentType.for(url: url) else {
            let supported = DocumentType.exts().joined(separator: ", ")
            let alert = NSAlert()
            alert.messageText = "Unsupported file type"
            alert.informativeText = "Only \(supported) documents can be opened."
            alert.runModal()
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        editLog.info("Opening \(url.path())")
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
            throw MarkupDocumentError.noWebViewAvailable
        }
        let html = try document.openHtmd(at: packageURL, baseUrl: webView.baseUrl)
        try setHTML(html)
        track(url: packageURL, handler: handler)
    }
    
    private func openHtml(at fileURL: URL, handler: (()->Void)? = nil) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let html = try document.openHtml(at: fileURL, baseUrl: webView.baseUrl)
        try setHTML(html)
        track(url: fileURL, handler: handler)
    }
    
    private func openMd(at url: URL, handler: (()->Void)? = nil) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let markdown: String
        do {
            markdown = try String(contentsOf: url, encoding: .utf8)
        } catch {
            showError("Could not read file: \(error.localizedDescription)")
            handler?()
            return
        }
        webView.importMarkdown(content: markdown) { value in
            guard let importValue = ImportExportValue.decode(from: value) else {
                showError("Unexpected response on import.")
                handler?()
                return
            }
            guard let html = importValue.result else {
                showError("Could not convert to HTML.")
                handler?()
                return
            }
            var warnings = importValue.warnings
            let metadata: [MetadataTuple]
            if let yamlString = importValue.metadata {
                metadata = YAMLMetadata.parse(yamlString, warnings: &warnings)
            } else {
                metadata = []
            }
            editLog.warnings(warnings)
            do {
                try document.openMd(at: url, baseUrl: webView.baseUrl, markdown: markdown, metadata: metadata)
                try setHTML(html)
                track(url: url, handler: handler)
            } catch let error {
                showError("Could not prepare file: \(error.localizedDescription)")
                handler?()
                return
            }
        }
    }
    
    private func getCurrentHTML(_ handler: ((String?)->Void)?) {
        guard let webView = MarkupEditor.selectedWebView else {
            handler?(nil)
            return
        }
        webView.getHtml { html in
            handler?(html)
        }
    }
    
    func getMarkdown(from html: String, handler: ((String?) -> Void)?) {
        guard let webView = MarkupEditor.selectedWebView else {
            handler?(nil)
            return
        }
        webView.exportMarkdown(content: html) { value in
            do {
                guard let exportValue = ImportExportValue.decode(from: value) else {
                    throw MarkupDocumentError.unexpectedExport
                }
                guard let markdown = exportValue.result else {
                    throw MarkupDocumentError.unableToExport
                }
                editLog.warnings(exportValue.warnings)
                handler?(markdown)
            } catch let error {
                editLog.error("Error exporting: \(error.localizedDescription)")
                handler?(nil)
            }
        }
    }
    
    func getHTML(from markdown: String, handler: ((String?)->Void)?) {
        guard let webView = MarkupEditor.selectedWebView else {
            handler?(nil)
            return
        }
        webView.importMarkdown(content: markdown) { value in
            do {
                guard let importValue = ImportExportValue.decode(from: value) else {
                    throw MarkupDocumentError.unexpectedImport
                }
                guard let html = importValue.result else {
                    throw MarkupDocumentError.unableToImport
                }
                handler?(html)
            } catch let error {
                editLog.error("Error importing: \(error.localizedDescription)")
                handler?(nil)
            }
        }
    }
    
    //MARK: Saving
    
    private func handleSave() {
        guard let webView = MarkupEditor.selectedWebView else { return }
        let oldURL = document.url
        // Set the url and then reset in the event of an error
        if document.url == nil {
            document.url = getSaveURL()
        }
        guard let url = document.url else {
            document.url = oldURL
            return
        }
        getCurrentHTML { html in
            guard let html else {
                document.url = oldURL
                return
            }
            getLocalImageSrcs { srcs in
                let baseUrl = webView.baseUrl
                // Because we have to get the markdown async, we need to do
                // the do-catch block inside of the case(s) as does setting of the NS* values.
                switch document.documentType {
                case .html:
                    do {
                        try document.saveHtml(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
                        track(url: url)
                    } catch let error {
                        editLog.error("Error saving: \(error.localizedDescription)")
                        document.url = oldURL
                    }
                case .htmd:
                    do {
                        try document.saveHtmd(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
                        track(url: url)
                    } catch let error {
                        editLog.error("Error saving: \(error.localizedDescription)")
                        document.url = oldURL
                    }
                case .md:
                    getMarkdown(from: html) { markdown in
                        do {
                            guard let markdown else {
                                document.url = oldURL
                                return
                            }
                            try document.saveMd(markdown: markdown, to: url, srcs: srcs, baseUrl: baseUrl)
                            track(url: url)
                        } catch let error {
                            editLog.error("Error saving: \(error.localizedDescription)")
                            document.url = oldURL
                        }
                    }
                }
            }
        }
    }
    
    /// Toggles the source view. Triggers a content refresh of the new view that opens.
    private func handleToggleSource() {
        if !rawShowing {
            // If we are viewing the MarkupEditor, then set the document source
            // to what is currently in the view before showing the source.
            setDocumentSourceFromView {
                withAnimation(.easeInOut(duration: 0.25)) { rawShowing.toggle() }
            }
        } else {
            // Else, the document.source contains any changes to source,
            // so we need to set the initialSource (HTML) based on it.
            setCurrentHtmlFromSource {
                withAnimation(.easeInOut(duration: 0.25)) { rawShowing.toggle() }
            }
        }
    }
    
    /// Set the document's `source` based on the contents of the MarkupWKWebView,
    private func setDocumentSourceFromView(handler: (()->Void)?) {
        getCurrentHTML { html in
            guard let html else {
                handler?()
                return
            }
            if document.isHTMLish {
                document.setSource(html)
                handler?()
            } else {
                getMarkdown(from: html) { markdown in
                    guard let markdown else {
                        handler?()
                        return
                    }
                    document.setSource(markdown)
                    handler?()
                }
            }
        }
    }
    
    /// Set the `currentHtml` based on the `currentSource` that was set in SourceView.
    private func setCurrentHtmlFromSource(handler: (()->Void)?) {
        if document.isHTMLish {
            currentHtml = currentSource
            handler?()
        } else {
            getHTML(from: currentSource) { html in
                guard let html else { return }
                currentHtml = html
                handler?()
            }
        }
    }

    private func handleOpenRecent(url: URL) {
        checkSave {
            Task { await openDocument(at: url) }
        }
    }

    private func handleExport(pluginName: String, fileExt: String) {
        let panel = NSSavePanel()
        let baseName = document.url?.deletingPathExtension().lastPathComponent ?? "Untitled"
        panel.nameFieldStringValue = fileExt.isEmpty ? baseName : "\(baseName).\(fileExt)"
        panel.allowedContentTypes = MarkupDocumentView.allowedContentTypes(forExt: fileExt)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        MarkupEditor.selectedWebView?.invokePlugin(name: pluginName, action: "export", content: nil) { result in
            guard let exportResult = ImportExportValue.decode(from: result),
                  let exportOutput = exportResult.result else {
                showError("Plugin '\(pluginName)' could not complete the operation.")
                return
            }
            let output = document.injectYAMLFrontMatter(into: exportOutput)
            do {
                try output.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                showError("Failed to write file: \(error.localizedDescription)")
            }
        }
    }

    private func handleSaveAs() {
        if let url = getSaveURL() {
            document.url = url
            handleSave()
        }
    }

    /// Prompt for a file to save to and return the URL if it is a support DocumentType
    private func getSaveURL() -> URL? {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = document.url?.lastPathComponent ?? ""
        guard panel.runModal() == .OK, let url = panel.url else {
            return nil
        }
        guard DocumentType.for(url: url) != nil else {
            editLog.error("Invalid save path: \(url.path(percentEncoded: false))")
            return nil
        }
        return url
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
        }
    }

    func markupInput(_ view: MarkupWKWebView) {
        document.hasChanges = true
        view.getSelectionState() { selectionState in
            MarkupEditor.selectionState.reset(from: selectionState)
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
        .environment(EditLog())
}
