//
//  MarkupDocumentView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib
import SplitView

internal import UniformTypeIdentifiers
internal import WebKit

private extension UTType {
    static let htmd = UTType("com.stevengharris.htmd") ?? .data
}

struct MarkupDocumentView: View {
    
    typealias ConfigKeys = AppConfig.ConfigKey
    typealias ToggledState = AppConfig.ToggledState
    
    @Environment(EditLog.self) private var editLog
    @Environment(\.openSettings) private var openSettings
    
    @ObservedObject var selectImage = MarkupEditor.selectImage
    
    @State private var document = MarkupDocument()  // The document we are editing, Markdown by default
    @State private var currentHtml = ""             // HTML for the MarkupEditorView when it starts or refreshes
    @State private var currentSource: String = ""   // HTML or Markdown that is shown in SourceView
    @State private var documentPickerShowing: Bool = false
    @State private var sourceShowing: Bool = false
    @State private var popupAnchor: PopoverAttachmentAnchor = PopoverAttachmentAnchor.rect(.rect(CGRect.zero))
    @State private var showLinkDialog: Bool = false
    @State private var showImageDialog: Bool = false
    
    @State private var infoHide = SideHolder.usingUserDefaults(key: "infoHide")
    let docFraction = FractionHolder.usingUserDefaults(0.75, key: "docFraction")
    
    @AppStorage(ConfigKeys.toolbar) private var toolbarConfigJSON = ""
    @AppStorage(ConfigKeys.keymap) private var keymapConfigJSON = ""
    @AppStorage(ConfigKeys.behavior) private var behaviorConfigJSON = ""
    @State private var markupConfiguration: MarkupWKWebViewConfiguration
    @State private var configVersion = 0    // Used as id for MarkupEditorView to trigger redraw w/new toolbar
    @ScaledMetric(relativeTo: .title3) var iconSize: CGFloat = 22
    
    var body: some View {
        //let _ = Self._printChanges()
        @Bindable var doc = document
        HSplit(
            left: {
                VStack(spacing: 0) {
                    if sourceShowing {
                        SourceView(
                            document: $document,
                            source: $currentSource
                        )
                    } else {
                        MarkupEditorView(
                            markupDelegate: self,
                            configuration: markupConfiguration,
                            html: $currentHtml,
                            placeholder: "Edit document...",
                            id: AppDelegate.webViewId
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
        .onChange(of: toolbarConfigJSON) { _, _ in
            markupConfiguration.toolbarConfig = ToolbarConfig.fromDefaults()
            reloadEditorForConfigChange()
        }
        .onChange(of: AppConfig.shared.codeViews) { _, _ in
            markupConfiguration.pluginFiles = AppConfig.shared.pluginFilenames()
            reloadEditorForConfigChange()
        }
        .onChange(of: AppConfig.shared.exporters) { _, _ in
            markupConfiguration.pluginFiles = AppConfig.shared.pluginFilenames()
            reloadEditorForConfigChange()
        }
        .onChange(of: keymapConfigJSON) { _, _ in
            markupConfiguration.keymapConfig = KeymapConfig.fromDefaults()
            reloadEditorForConfigChange()
        }
        // spellcheck and autocorrect are always set together (see GeneralSettingsView's
        // spellingCorrectionBinding()), so watching spellcheck alone is sufficient.
        .onChange(of: AppConfig.shared.spellcheck) { _, _ in
            markupConfiguration.topLevelAttributes = AppConfig.shared.topLevelAttributes()
            reloadEditorForConfigChange()
        }
        .onChange(of: AppConfig.shared.inlinePredictions) { _, _ in
            markupConfiguration.allowsInlinePredictions = AppConfig.shared.inlinePredictions
            reloadEditorForConfigChange()
        }
        .popover(isPresented: $showImageDialog, attachmentAnchor: popupAnchor) {
            ImageInsertView(presented: $showImageDialog)
        }
        .popover(isPresented: $showLinkDialog, attachmentAnchor: popupAnchor) {
            LinkInsertView(presented: $showLinkDialog)
        }
        // Consolidate menu items into a single .task modifier
        .task {
            let names: [Notification.Name] = [
                .menuNewDocument, .menuOpenDocument, .menuSaveDocument,
                .menuSaveAsDocument, .menuToggleSource, .menuShowSettings,
                .menuOpenRecentDocument, .menuExport,
                .menuQuitApplication, NSWindow.willCloseNotification,
            ]
            await withTaskGroup(of: Void.self) { group in
                for name in names {
                    group.addTask {
                        await listenForMenuNotifications(named: name)
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
                Task {
                    guard await checkSave() else { return }
                    await openDocument(at: url)
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
                toolbarConfigJSON: $toolbarConfigJSON,
                markupConfiguration: $markupConfiguration,
                infoHide: $infoHide
            )
        }
    }
    
    init() {
        // The markupConfiguration must be set before the first render.
        let config = MarkupWKWebViewConfiguration()
        config.toolbarConfig = ToolbarConfig.fromDefaults()
        config.keymapConfig = KeymapConfig.fromDefaults()
        config.behaviorConfig = BehaviorConfig.fromDefaults()
        config.delegate = "MarkupEditorDelegate"
        config.topLevelAttributes = AppConfig.shared.topLevelAttributes()
        config.allowsInlinePredictions = AppConfig.shared.inlinePredictions
        config.userScriptFile = "markupeditor-app.js"
        config.userCssFile = "markupeditor-app.css"
        config.pluginFiles = AppConfig.shared.pluginFilenames()
        _markupConfiguration = State(initialValue: config)
    }
    
    //MARK: Config
    
    /// Load the markupConfiguration with the configuration data from the JSON for each type of config.
    private func applyStoredConfigOverrides() {
        markupConfiguration.toolbarConfig = Self.decodeConfig(ToolbarConfig.self, from: toolbarConfigJSON)
        markupConfiguration.keymapConfig = Self.decodeConfig(KeymapConfig.self, from: keymapConfigJSON)
        markupConfiguration.behaviorConfig = Self.decodeConfig(BehaviorConfig.self, from: behaviorConfigJSON)
    }
    
    /// Return an instance of the particular config that is defined in `json`
    static func decodeConfig<T: Decodable>(_ type: T.Type, from json: String) -> T? {
        guard !json.isEmpty, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    
    /// Fetch the current web view's HTML and bump configVersion, forcing MarkupEditorView to redraw via .id(configVersion).
    private func reloadEditorForConfigChange() {
        Task {
            currentHtml = await getCurrentContents().html ?? ""
            configVersion += 1
        }
    }
    
    // MARK: - Menu operations

    /// Listen for and dispatch all notifications posted under `name`.
    private func listenForMenuNotifications(named name: Notification.Name) async {
        for await notification in NotificationCenter.default.notifications(named: name) {
            await handleMenuNotification(notification)
        }
    }

    /// Handle the notifications we get when a menu item is picked. This style avoids having lots of
    /// .onChange modifiers and makes it easier to see in one place.
    private func handleMenuNotification(_ notification: Notification) async {
        switch notification.name {
        case .menuNewDocument:
            await handleNew()
        case .menuOpenDocument:
            await handleOpen()
        case .menuSaveDocument:
            await handleSave()
        case .menuSaveAsDocument:
            await handleSaveAs()
        case .menuToggleSource:
            await handleToggleSource()
        case .menuShowSettings:
            openSettings()
        case .menuOpenRecentDocument:
            guard let url = notification.object as? URL else { return }
            await handleOpenRecent(url: url)
        case .menuExport:
            guard let plugin = notification.userInfo?["plugin"] as? Plugin else { return }
            await handleExport(plugin: plugin)
        case .menuQuitApplication:
            await handleQuit()
        case NSWindow.willCloseNotification:
            NotificationCenter.default.post(name: .dismissSettings, object: nil)
        default:
            break
        }
    }
    
    /// Open a new Markdown document
    private func handleNew() async {
        guard let webView = MarkupEditor.selectedWebView else { return }
        guard await checkSave() else { return }
        editLog.info("Opening a new document")
        await webView.emptyDocument()
        document.setSource("", documentType: .md)
        currentHtml = MarkupDocument.emptyHTML
        currentSource = MarkupDocument.emptyMarkdown
        document.reset()
        NSApplication.shared.mainWindow?.representedURL = nil
    }

    /// Let the user select a file to open, and then open it
    private func handleOpen() async {
        guard await checkSave() else { return }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = DocumentType.utTypes()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        
        // If we are opening a .md file that has local image sources in it, then we need
        // explicit permission to open the parent directory to access those images.
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
            dirPanel.message = "This document uses local images. Grant read access to the containing folder to display them."
            if dirPanel.runModal() == .OK, let dirURL = dirPanel.url {
                document.storeParentDirBookmark(for: url, using: dirURL)
            }
        } else {
            document.storeParentDirBookmark(for: url)
        }
        await openDocument(at: url)
    }
    
    /// Toggle the source view. Trigger a content refresh of the new view that opens.
    private func handleToggleSource() async {
        if !sourceShowing {
            // If we are viewing the MarkupEditor, then set the document source
            // to what is currently in the view before showing the source.
            await setDocumentSourceFromView()
            withAnimation(.easeInOut(duration: 0.25)) { sourceShowing.toggle() }
        } else {
            // Else, the document.source contains any changes to source,
            // so we need to set the initialSource (HTML) based on it.
            await setCurrentHtmlFromSource()
            withAnimation(.easeInOut(duration: 0.25)) { sourceShowing.toggle() }
        }
    }

    /// The user selected a file from the Open Recent menu
    private func handleOpenRecent(url: URL) async {
        guard await checkSave() else { return }
        await openDocument(at: url)
    }
    
    /// Quit the app if `checkSave` passes, and make sure settings is also closed
    private func handleQuit() async {
        guard await checkSave() else { return }
        if AppDelegate.isRespondingToTerminateQuery {
            // Cmd+Q path: applicationShouldTerminate returned .terminateLater
            AppDelegate.isRespondingToTerminateQuery = false
            NSApp.reply(toApplicationShouldTerminate: true)
        } else {
            // Close-button path: window is still open; terminate now
            AppDelegate.skipTerminateCheck = true
            NSApp.terminate(nil)
        }
    }

    //MARK: Shared functions
    
    /// Keep track of the URL we are working on in recentDocuments and show in the window title bar
    private func track(url: URL) {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        NSApplication.shared.mainWindow?.representedURL = url
    }
    
    /// For now, just show an error in the log, but in longer run, show notification breadcrumbs
    private func showError(_ message: String) {
        editLog.error(message)
    }
    
    /// Let the MarkupDelegate deal with the `url` that identifies an image to add to the document
    private func imageSelected(url: URL) {
        guard let selectedWebView = MarkupEditor.selectedWebView else { return }
        markupImageToAdd(selectedWebView, url: url)
    }
    
    /// Present a save/discard/cancel alert if the document has unsaved changes.
    /// Returns true to proceed, false if the user cancelled.
    private func checkSave() async -> Bool {
        guard document.hasChanges else { return true }
        let alert = NSAlert()
        alert.messageText = "Do you want to save the changes to this document?"
        alert.informativeText = "Your changes will be lost if you don't save them."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Don't Save")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            await handleSave()
            return !document.hasChanges
        case .alertSecondButtonReturn:  // Don't modify the hasChanges state
            return true
        default:
            return false
        }
    }
    
    /// Set the HTML contents of the MarkupWKWebView
    func setHTML(_ html: String?) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        guard let html else {
            throw MarkupDocumentError.couldNotSetHTML
        }
        webView.setHtml(html)
        currentHtml = html
    }
    
    /// Set the document's `source` based on the contents of the MarkupWKWebView.
    private func setDocumentSourceFromView() async {
        guard let webView = MarkupEditor.selectedWebView else { return }
        guard let html = await webView.getHtml() else { return }
        if document.isHTMLish {
            document.setSource(html)
            currentSource = html
        } else {
            do {
                let markdown = try await getMarkdown(from: html)
                document.setSource(markdown)
                currentSource = markdown
            } catch {
                showError(error.localizedDescription)
            }
        }
    }

    /// Set the `currentHtml` based on the `currentSource` that was set in SourceView.
    private func setCurrentHtmlFromSource() async {
        if document.isHTMLish {
            currentHtml = currentSource
        } else {
            do {
                currentHtml = try await getHTML(from: currentSource)
            } catch {
                showError(error.localizedDescription)
            }
        }
    }
    
    //MARK: Opening files
    
    /// The user identified the `url` of a document to open. It should just have one of the `DocumentType.exts()`,
    /// but if not, then let the user know and return.
    private func openDocument(at url: URL) async {
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
        
        // Open the specific kind of document
        do {
            switch docType {
            case .html:
                try openHtml(at: url)
            case .md:
                try await openMd(at: url)
            case .htmd:
                try openHtmd(at: url)
            }
        } catch let error {
            showError(error.localizedDescription)
            // For open error, we need to make sure the user sees them, not just log.
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }
    
    /// Open a .htmd package that contains the document, images, and metadata
    private func openHtmd(at packageURL: URL) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let html = try document.openHtmd(at: packageURL, baseUrl: webView.baseUrl)
        try setHTML(html)
        currentSource = html
        track(url: packageURL)
    }

    /// Open an HTML file
    private func openHtml(at fileURL: URL) throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let html = try document.openHtml(at: fileURL, baseUrl: webView.baseUrl)
        try setHTML(html)
        currentSource = html
        track(url: fileURL)
    }

    // Open a Markdown file
    private func openMd(at url: URL) async throws {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let markdown: String
        do {
            markdown = try String(contentsOf: url, encoding: .utf8)
        } catch {
            throw MarkupDocumentError.couldNotReadFile("\(error.localizedDescription)")
        }
        let converted = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        var warnings = converted.warnings
        let metadata: [MetadataTuple]
        if let yamlString = converted.metadata {
            metadata = YAMLMetadata.parse(yamlString, warnings: &warnings)
        } else {
            metadata = []
        }
        editLog.warnings(warnings)
        do {
            try document.openMd(at: url, baseUrl: webView.baseUrl, markdown: markdown, metadata: metadata)
        } catch {
            throw MarkupDocumentError.couldNotPrepareFile("\(error.localizedDescription)")
        }
        try setHTML(converted.result)
        currentSource = markdown
        track(url: url)
    }
    
    //MARK: Getting HTML and Markdown
    
    /// Return the HTML and/or Markdown that is currently showing in the view. If there are no errors encountered,
    /// then HTML will always be returned. Sometimes Markdown will also be returned because we already have it,
    /// and we want to avoid having to derive it from the HTML if possible.
    ///
    /// When showing source, the `currentSource` is modified while typing, so it is always the most up-to-date.
    /// It might hold HTML or Markdown, depending on the `document.documentType`. If Markdown, then we
    /// return both HTML obtained from `currentSource` as well as the Markdown. If HTML, then we return the
    /// HTML.
    ///
    /// When showing HTML (the MarkupWebView), the most up-to-date source is always found from the
    /// `webView` using `getHtml`. In that case, we return just the HTML, because we don't set the
    /// `currentSource` until we open the SourceView, because it may involve a conversion to Markdown,
    /// and we want to avoid that until we really need it.
    private func getCurrentContents() async -> (html: String?, markdown: String?) {
        var html: String? = nil
        var markdown: String? = nil
        guard let webView = MarkupEditor.selectedWebView else { return (html: html, markdown: markdown) }
        if sourceShowing {
            if document.isHTMLish {
                html = currentSource
            } else {
                markdown = currentSource
                html = try? await getHTML(from: currentSource)
            }
        } else if let htmlContents = await webView.getHtml() {
            html = htmlContents
            if !document.isHTMLish {
                markdown = try? await getMarkdown(from: htmlContents)
            }
        }
        return (html: html, markdown: markdown)
    }

    /// Return Markdown that is imported from the `html` string.
    func getMarkdown(from html: String) async throws -> String {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let converted = try await MarkupConverter.exportMarkdownDecoded(webView, content: html)
        editLog.warnings(converted.warnings)
        return converted.result
    }

    /// Return the HTML that is derived from the `markdown` string.
    func getHTML(from markdown: String) async throws -> String {
        guard let webView = MarkupEditor.selectedWebView else {
            throw MarkupDocumentError.noWebViewAvailable
        }
        let converted = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        editLog.warnings(converted.warnings)
        return converted.result
    }
    
    //MARK: Saving
    
    /// Handle saving of the current contents.
    ///
    /// The issue here is that we have 3 different types of documents we can be editing, and the save
    /// operation is specific to the `documentType`. The `document` can be out-of-sync with the
    /// current contents we are editing, as determined by whether `document.hasChanges`.
    private func handleSave(_ newURL: URL? = nil) async {
        guard document.hasChanges || newURL != nil else { return }   // newURL passed for saveAs
        guard let webView = MarkupEditor.selectedWebView else { return }
        let oldURL = document.url
        document.url = newURL ?? getSaveURL()
        guard let url = document.url else {
            document.url = oldURL
            return
        }
        let contents = await getCurrentContents()
        //TODO: Fix to get local images from the proper source
        let srcs = await webView.getLocalImages()
        let baseUrl = webView.baseUrl
        do {
            switch document.documentType {
            case .html:
                guard let html = contents.html else { throw MarkupDocumentError.noHTMLSource }
                try document.saveHtml(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
            case .htmd:
                guard let html = contents.html else { throw MarkupDocumentError.noHTMLSource }
                try document.saveHtmd(html: html, to: url, srcs: srcs, baseUrl: baseUrl)
            case .md:
                guard let markdown = contents.markdown else { throw MarkupDocumentError.noMarkdownSource }
                try document.saveMd(markdown: markdown, to: url, srcs: srcs, baseUrl: baseUrl)
            }
            track(url: url)
        } catch {
            editLog.error("Error saving: \(error.localizedDescription)")
            document.url = oldURL
        }
    }
    
    private func handleExport(plugin: Plugin) async {
        guard let ext = plugin.ext else {
            let alert = NSAlert()
            alert.messageText = "Cannot export"
            alert.informativeText = "Plugin '\(plugin.name)' has no file extension specified."
            alert.runModal()
            return
        }
        guard let webView = MarkupEditor.selectedWebView else {
            let alert = NSAlert()
            alert.messageText = "Cannot export"
            alert.informativeText = "No web view is available."
            alert.runModal()
            return
        }
        let panel = NSSavePanel()
        let baseName = document.url?.deletingPathExtension().lastPathComponent ?? "Untitled"
        panel.nameFieldStringValue = ext.isEmpty ? baseName : "\(baseName).\(ext)"
        panel.allowedContentTypes = UTType(filenameExtension: ext).map { [$0] } ?? []
        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            // The built-in PDF exporter is distinguished from a user-installed plugin by
            // having no filename -- ExporterManager.add always sets one, so a user-installed
            // plugin literally named "PDF" still routes through the generic path below rather
            // than being shadowed by this special case.
            if plugin.name == "PDF" && plugin.filename == nil {
                let data = try await webView.exportPDF()
                try data.write(to: url)
                editLog.info("PDF exported to: \(url.path)")
            } else {
                let exportStart = Date()
                let (outputData, warnings) = try await MarkupConverter.runExporterDecoded(webView, name: plugin.name)
                let exportElapsed = Date().timeIntervalSince(exportStart)
                editLog.warnings(warnings)
                try outputData.write(to: url)
                editLog.info("\(plugin.name) exported to: \(url.path(percentEncoded: false)), \(outputData.count) bytes, \(String(format: "%.2f", exportElapsed))s")
            }
        } catch {
            // Export errors, like open errors, need to be visible to the user, not just logged.
            showError(error.localizedDescription)
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    /// Identify a new URL to save the current document as
    private func handleSaveAs() async {
        if let url = getSaveURL() {
            await handleSave(url)
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

}

extension MarkupDocumentView: MarkupDelegate {

    func markupDidLoad(_ view: MarkupWKWebView, handler: (()->Void)?) {
        MarkupEditor.selectedWebView = view
        view.setToolbarVisible(!AppConfig.shared.isHidden())
        if let url = AppDelegate.consumePendingURL() {
            Task {
                await openDocument(at: url)
                handler?()
            }
        }
    }

    func markupInput(_ view: MarkupWKWebView) {
        document.hasChanges = true
        Task { @MainActor in
            let selectionState = await view.getSelectionState()
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
    
    func markupInsertLink(_ view: MarkupWKWebView?) {
        view?.getSelectionState { selectionState in
            popupAnchor = PopoverAttachmentAnchor.rect(.rect(selectionState.sourceRect ?? CGRect.zero))
            showLinkDialog = true
        }
    }
    
    func markupInsertImage(_ view: MarkupWKWebView?) {
        view?.getSelectionState { selectionState in
            popupAnchor = PopoverAttachmentAnchor.rect(.rect(selectionState.sourceRect ?? CGRect.zero))
            showImageDialog = true
        }
    }

    func markupPluginsDidLoad(_ view: MarkupWKWebView, plugins: [[String: String]]) {
        guard let appDelegate = NSApplication.shared.delegate as? AppDelegate else { return }
        appDelegate.populateExportMenu()
    }

    /// An error occurred on the JavaScript side (internal MUErrors, or a plugin using
    /// MU.reportError, e.g. markupeditor-mermaid on a failed diagram render). Route it
    /// through the same info-view log Swift-originated errors already use, rather than
    /// the default MarkupDelegate implementation's OSLog-only behavior.
    func markupError(code: String, message: String, info: String?, alert: Bool) {
        showError("Error \(code): \(message)")
    }

}

#Preview {
    MarkupDocumentView()
        .environment(EditLog())
}
