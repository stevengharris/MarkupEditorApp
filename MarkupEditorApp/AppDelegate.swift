//
//  AppDelegate.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import AppKit
import MarkupEditor

class AppDelegate: NSObject, NSApplicationDelegate {

    private var keymap: KeymapConfig?
    private var openRecentMenu = NSMenu(title: "Open Recent")
    @MainActor static var pendingFinderURL: URL?
    @MainActor static var docIcon: NSImage?

    /// Submenu under File > Export, populated by populatePluginMenus(_:).
    var exportSubmenu = NSMenu(title: "Export")
    /// Submenu under File > Import, populated by populatePluginMenus(_:).
    var importSubmenu = NSMenu(title: "Import")

    @MainActor static func consumePendingURL() -> URL? {
        guard let url = pendingFinderURL else { return nil }
        pendingFinderURL = nil
        return url
    }

    /// Quit the app when the window is closed. Without this, SwiftUI keeps the
    /// process alive and `applicationDidFinishLaunching` won't fire on the next
    /// Xcode run, which prevents the custom menu from being rebuilt.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
    
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSWindow.allowsAutomaticWindowTabbing = false
        keymap = KeymapConfig.fromDefaults()         // Use app's keymapconfig.json
        if let bundleURL = Bundle.main.url(forResource: "markupeditor-doc", withExtension: "icns") {
            Self.docIcon = NSImage(byReferencing: bundleURL)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Rebuild and reassign the full menu after SwiftUI has finished its
        // mutation pass. A fresh NSMenu is required because SwiftUI removed
        // items from the original — those NSMenuItems can't simply be re-added
        // since their parent reference was cleared during removal.
        // Defer to the next run loop iteration so SwiftUI's window setup is
        // fully complete before we replace the menu.
        DispatchQueue.main.async { [self] in
            NSApplication.shared.mainMenu = buildMenu()
        }
    }

    // MARK: - File menu actions
    //
    // Menu items post notifications that MarkupDocumentView handles, so the view
    // owns document state (hasChanges, currentFileURL) and file I/O logic.

    @objc private func newDocument(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuNewDocument, object: nil)
    }

    @objc private func openDocument(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuOpenDocument, object: nil)
    }

    @objc private func saveDocument(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuSaveDocument, object: nil)
    }

    @objc private func saveAsDocument(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuSaveAsDocument, object: nil)
    }

    @objc private func showHtml(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuShowHtml, object: nil)
    }

    @objc private func showSettings(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuShowSettings, object: nil)
    }

    @objc private func openRecentDocument(_ sender: NSMenuItem) {
        guard let url = sender.representedObject as? URL else { return }
        NotificationCenter.default.post(name: .menuOpenRecentDocument, object: url)
    }

    @objc private func clearRecentDocuments(_ sender: Any?) {
        NSDocumentController.shared.clearRecentDocuments(nil)
    }

#if DEBUG
    @objc private func clearUserDefaults(_ sender: Any?) {
        NotificationCenter.default.post(name: .menuClearUserDefaults, object: nil)
    }

    /// Fills Export and Import submenus from the plugin manifest.
    ///
    /// Safe to call multiple times — existing items are replaced on each call.
    /// Each Export item posts `.menuExportPlugin`; each Import item posts `.menuImportPlugin`.
    /// Both notifications carry `userInfo` with `"name"` and `"filename"` from the entry.
    public func populatePluginMenus(_ entries: [AppConfig.PluginConfigEntry]) {
        exportSubmenu.removeAllItems()
        importSubmenu.removeAllItems()
        for entry in entries {
            let exportItem = NSMenuItem(title: entry.name, action: #selector(exportPluginAction(_:)), keyEquivalent: "")
            exportItem.target = self
            exportItem.representedObject = entry
            exportSubmenu.addItem(exportItem)

            let importItem = NSMenuItem(title: entry.name, action: #selector(importPluginAction(_:)), keyEquivalent: "")
            importItem.target = self
            importItem.representedObject = entry
            importSubmenu.addItem(importItem)
        }
    }

    @objc private func exportPluginAction(_ sender: NSMenuItem) {
        guard let entry = sender.representedObject as? AppConfig.PluginConfigEntry else { return }
        NotificationCenter.default.post(
            name: .menuExportPlugin,
            object: nil,
            userInfo: ["name": entry.name, "filename": entry.filename]
        )
    }

    @objc private func importPluginAction(_ sender: NSMenuItem) {
        guard let entry = sender.representedObject as? AppConfig.PluginConfigEntry else { return }
        NotificationCenter.default.post(
            name: .menuImportPlugin,
            object: nil,
            userInfo: ["name": entry.name, "filename": entry.filename]
        )
    }
#endif

    func buildMenu() -> NSMenu {
        let mainMenu = NSMenu()

        // Standard app menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        let appName = ProcessInfo.processInfo.processName
        appMenu.addItem(NSMenuItem(title: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        let servicesItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        servicesItem.submenu = NSMenu(title: "Services")
        NSApp.servicesMenu = servicesItem.submenu
        appMenu.addItem(servicesItem)
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(NSMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Settings…", action: #selector(showSettings(_:)), keyEquivalent: ","))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu

        // File menu
        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(NSMenuItem(title: "New", action: #selector(newDocument(_:)), keyEquivalent: "n"))
        fileMenu.addItem(NSMenuItem(title: "Open…", action: #selector(openDocument(_:)), keyEquivalent: "o"))
        let openRecentItem = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
        openRecentItem.submenu = openRecentMenu
        openRecentMenu.delegate = self
        fileMenu.addItem(openRecentItem)
        fileMenu.addItem(.separator())
        fileMenu.addItem(NSMenuItem(title: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        fileMenu.addItem(NSMenuItem(title: "Save", action: #selector(saveDocument(_:)), keyEquivalent: "s"))
        let saveAsItem = NSMenuItem(title: "Save As…", action: #selector(saveAsDocument(_:)), keyEquivalent: "s")
        saveAsItem.keyEquivalentModifierMask = [.command, .shift]
        saveAsItem.image = NSImage(systemSymbolName: "square.and.arrow.down.on.square", accessibilityDescription: "Save As")
        fileMenu.addItem(saveAsItem)
        fileMenu.addItem(.separator())
        let exportItem = NSMenuItem(title: "Export", action: nil, keyEquivalent: "")
        exportItem.submenu = exportSubmenu
        fileMenu.addItem(exportItem)
        let importItem = NSMenuItem(title: "Import", action: nil, keyEquivalent: "")
        importItem.submenu = importSubmenu
        fileMenu.addItem(importItem)
        fileMenuItem.submenu = fileMenu

        // Standard edit menu
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: #selector(MarkupWKWebView.undoFromMenu(_:)), keyEquivalent: "z"))
        let redoItem = NSMenuItem(title: "Redo", action: #selector(MarkupWKWebView.redoFromMenu(_:)), keyEquivalent: "z")
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redoItem)
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editMenu.addItem(.separator())
        let findItem = jsMenuItem(title: "Find", js: "MU.toggleSearch()", keyEquivalent: "f", modifierMask: .command)
        findItem.image = NSImage(systemSymbolName: "magnifyingglass", accessibilityDescription: "Find")
        editMenu.addItem(findItem)
        editMenuItem.submenu = editMenu

        // Format menu driven by app's toolbarconfig.json
        let config = ToolbarConfig.fromDefaults()
        if let formatMenu = buildFormatMenu(from: config) {
            let formatMenuItem = NSMenuItem()
            formatMenuItem.submenu = formatMenu
            mainMenu.addItem(formatMenuItem)
        }

        // Standard view menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(NSMenuItem(title: "Actual Size", action: #selector(MarkupWKWebView.zoomToActualSize(_:)), keyEquivalent: "0"))
        let zoomIn = NSMenuItem(title: "Zoom In", action: #selector(MarkupWKWebView.zoomIn(_:)), keyEquivalent: "+")
        zoomIn.keyEquivalentModifierMask = .command
        viewMenu.addItem(zoomIn)
        let zoomOut = NSMenuItem(title: "Zoom Out", action: #selector(MarkupWKWebView.zoomOut(_:)), keyEquivalent: "-")
        zoomOut.keyEquivalentModifierMask = .command
        viewMenu.addItem(zoomOut)
        viewMenu.addItem(.separator())
        let toggleFullScreen = NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        toggleFullScreen.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(toggleFullScreen)
        viewMenu.addItem(.separator())
        let showHtmlItem = NSMenuItem(title: "Show HTML", action: #selector(showHtml(_:)), keyEquivalent: "u")
        showHtmlItem.keyEquivalentModifierMask = [.command, .shift]
        showHtmlItem.image = NSImage(systemSymbolName: "chevron.left.slash.chevron.right", accessibilityDescription: "Show HTML")
        showHtmlItem.target = self
        viewMenu.addItem(showHtmlItem)
        viewMenuItem.submenu = viewMenu

        // Standard window menu
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        windowMenu.addItem(.separator())
        windowMenu.addItem(NSMenuItem(title: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: ""))
        windowMenuItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        // Develop menu (debug builds only)
#if DEBUG
        let developMenuItem = NSMenuItem()
        let developMenu = NSMenu(title: "Develop")
        developMenu.addItem(NSMenuItem(title: "Clear UserDefaults", action: #selector(clearUserDefaults(_:)), keyEquivalent: ""))
        developMenuItem.submenu = developMenu
        mainMenu.addItem(developMenuItem)
#endif

        // Standard help menu
        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "Help")
        let helpItem = NSMenuItem(title: "\(appName) Help", action: #selector(NSApplication.showHelp(_:)), keyEquivalent: "?")
        helpMenu.addItem(helpItem)
        helpMenuItem.submenu = helpMenu
        NSApp.helpMenu = helpMenu
        
        return mainMenu
    }

    // MARK: - Config-driven menu building

    /// Create an NSMenuItem with key binding from the keymap config.
    private func menuItem(title: String, action: Selector, keymapAction: String) -> NSMenuItem {
        if let binding = keymap?.binding(for: keymapAction) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: binding.keyEquivalent)
            item.keyEquivalentModifierMask = binding.modifierMask
            return item
        }
        return NSMenuItem(title: title, action: action, keyEquivalent: "")
    }

    private func buildFormatMenu(from config: ToolbarConfig) -> NSMenu? {
        let visibility = config.visibility
        guard visibility["toolbar"] == true else { return nil }

        // Collect submenus in order specified by the ordering config
        var orderedEntries: [(Int, NSMenuItem)] = []

        if visibility["insertBar"] == true, let submenuItem = buildInsertSubmenuItem(from: config) {
            let order = config.ordering["insertBar"] ?? 20
            orderedEntries.append((order, submenuItem))
        }
        if visibility["styleMenu"] == true, let submenuItem = buildStyleSubmenuItem(from: config) {
            let order = config.ordering["styleMenu"] ?? 30
            orderedEntries.append((order, submenuItem))
        }
        if visibility["styleBar"] == true {
            let styleBar = config.styleBar
            if styleBar["list"] == true {
                let order = config.ordering["styleBar"] ?? 40
                for item in buildListItems() {
                    orderedEntries.append((order, item))
                }
            }
            if styleBar["dent"] == true {
                let order = (config.ordering["styleBar"] ?? 40) + 1
                for item in buildDentItems() {
                    orderedEntries.append((order, item))
                }
            }
        }
        if visibility["formatBar"] == true {
            let order = config.ordering["formatBar"] ?? 50
            for item in buildFormatItems(from: config) {
                orderedEntries.append((order, item))
            }
        }

        guard !orderedEntries.isEmpty else { return nil }

        // Stable sort by order
        orderedEntries.sort { $0.0 < $1.0 }

        let formatMenu = NSMenu(title: "Format")
        var lastOrder: Int?
        for (order, item) in orderedEntries {
            if let last = lastOrder, last != order {
                formatMenu.addItem(.separator())
            }
            formatMenu.addItem(item)
            lastOrder = order
        }
        return formatMenu
    }

    // MARK: - Insert menu via executeJavaScript

    /// Execute a JavaScript command on the selected MarkupWKWebView.
    /// Menu items store their JS command string in representedObject.
    @MainActor @objc private func executeMenuJS(_ sender: NSMenuItem) {
        guard let js = sender.representedObject as? String else { return }
        MarkupEditor.selectedWebView?.executeJavaScript(js)
    }

    /// Create an NSMenuItem whose action calls executeJavaScript with the given JS command.
    private func jsMenuItem(title: String, js: String, keyEquivalent: String = "", modifierMask: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: #selector(executeMenuJS(_:)), keyEquivalent: keyEquivalent)
        item.keyEquivalentModifierMask = modifierMask
        item.representedObject = js
        item.target = self
        return item
    }

    /// Create a JS menu item with key binding from the keymap config.
    private func jsMenuItem(title: String, js: String, keymapAction: String) -> NSMenuItem {
        if let binding = keymap?.binding(for: keymapAction) {
            let item = NSMenuItem(title: title, action: #selector(executeMenuJS(_:)), keyEquivalent: binding.keyEquivalent)
            item.keyEquivalentModifierMask = binding.modifierMask
            item.representedObject = js
            item.target = self
            return item
        }
        let item = NSMenuItem(title: title, action: #selector(executeMenuJS(_:)), keyEquivalent: "")
        item.representedObject = js
        item.target = self
        return item
    }

    private func buildInsertSubmenuItem(from config: ToolbarConfig) -> NSMenuItem? {
        let items = config.insertBar
        let submenu = NSMenu(title: "Insert")

        if items["link"] == true {
            let linkItem = menuItem(title: "Link", action: #selector(MarkupWKWebView.openLinkDialogFromMenu), keymapAction: "link")
            linkItem.image = NSImage(systemSymbolName: "link", accessibilityDescription: "Link")
            submenu.addItem(linkItem)
        }
        if items["image"] == true {
            let imageItem = jsMenuItem(title: "Image", js: "MU.openImageDialog()", keymapAction: "image")
            imageItem.image = NSImage(systemSymbolName: "photo", accessibilityDescription: "Image")
            submenu.addItem(imageItem)
        }
        if items["tableMenu"] == true {
            let tableItem = buildTableSubmenuItem(from: config)
            tableItem.image = NSImage(systemSymbolName: "squareshape.split.3x3", accessibilityDescription: "Table")
            submenu.addItem(tableItem)
        }

        guard submenu.numberOfItems > 0 else { return nil }
        let item = NSMenuItem(title: "Insert", action: nil, keyEquivalent: "")
        item.image = NSImage(systemSymbolName: "text.insert", accessibilityDescription: "Insert")
        item.submenu = submenu
        return item
    }

    private func buildTableSubmenuItem(from config: ToolbarConfig) -> NSMenuItem {
        let tableItem = NSMenuItem(title: "Table", action: nil, keyEquivalent: "")
        let tableMenu = NSMenu(title: "Table")

        // Create submenu — rows x cols grid
        let createItem = NSMenuItem(title: "Create", action: nil, keyEquivalent: "")
        let createMenu = NSMenu(title: "Create")
        for rows in 1...4 {
            let rowItem = NSMenuItem(title: "\(rows) Row\(rows > 1 ? "s" : "")", action: nil, keyEquivalent: "")
            let rowMenu = NSMenu(title: "\(rows) Row\(rows > 1 ? "s" : "")")
            for cols in 1...4 {
                rowMenu.addItem(jsMenuItem(title: "\(cols) Col\(cols > 1 ? "s" : "")", js: "MU.insertTable(\(rows), \(cols))"))
            }
            rowItem.submenu = rowMenu
            createMenu.addItem(rowItem)
        }
        createItem.submenu = createMenu
        tableMenu.addItem(createItem)

        // Add submenu
        let addItem = NSMenuItem(title: "Add", action: nil, keyEquivalent: "")
        let addMenu = NSMenu(title: "Add")
        addMenu.addItem(jsMenuItem(title: "Row Above", js: "MU.addRow(\"BEFORE\")"))
        addMenu.addItem(jsMenuItem(title: "Row Below", js: "MU.addRow(\"AFTER\")"))
        addMenu.addItem(jsMenuItem(title: "Column Before", js: "MU.addCol(\"BEFORE\")"))
        addMenu.addItem(jsMenuItem(title: "Column After", js: "MU.addCol(\"AFTER\")"))
        if config.menus["tableHeader"] == true {
            addMenu.addItem(jsMenuItem(title: "Header", js: "MU.addHeader()"))
        }
        addItem.submenu = addMenu
        tableMenu.addItem(addItem)

        // Delete submenu
        let deleteItem = NSMenuItem(title: "Delete", action: nil, keyEquivalent: "")
        let deleteMenu = NSMenu(title: "Delete")
        deleteMenu.addItem(jsMenuItem(title: "Row", js: "MU.deleteTableArea(\"ROW\")"))
        deleteMenu.addItem(jsMenuItem(title: "Column", js: "MU.deleteTableArea(\"COL\")"))
        deleteMenu.addItem(jsMenuItem(title: "Table", js: "MU.deleteTableArea(\"TABLE\")"))
        deleteItem.submenu = deleteMenu
        tableMenu.addItem(deleteItem)

        // Border submenu
        if config.menus["tableBorder"] == true {
            let borderItem = NSMenuItem(title: "Border", action: nil, keyEquivalent: "")
            let borderMenu = NSMenu(title: "Border")
            borderMenu.addItem(jsMenuItem(title: "All", js: "MU.borderTable(\"cell\")"))
            borderMenu.addItem(jsMenuItem(title: "Outer", js: "MU.borderTable(\"outer\")"))
            borderMenu.addItem(jsMenuItem(title: "Header", js: "MU.borderTable(\"header\")"))
            borderMenu.addItem(jsMenuItem(title: "None", js: "MU.borderTable(\"none\")"))
            borderItem.submenu = borderMenu
            tableMenu.addItem(borderItem)
        }

        tableItem.submenu = tableMenu
        return tableItem
    }

    private func buildStyleSubmenuItem(from config: ToolbarConfig) -> NSMenuItem? {
        var styleEntries: [(key: String, selector: Selector, defaultTitle: String)] = []
        if let pTitle = config.name(forTag: "p") { styleEntries.append(("p", #selector(MarkupWKWebView.pStyle), pTitle)) }
        if let h1Title = config.name(forTag: "h1") { styleEntries.append(("h1", #selector(MarkupWKWebView.h1Style), h1Title)) }
        if let h2Title = config.name(forTag: "h2") { styleEntries.append(("h2", #selector(MarkupWKWebView.h2Style), h2Title)) }
        if let h3Title = config.name(forTag: "h3") { styleEntries.append(("h3", #selector(MarkupWKWebView.h3Style), h3Title)) }
        if let h4Title = config.name(forTag: "h4") { styleEntries.append(("h4", #selector(MarkupWKWebView.h4Style), h4Title)) }
        if let h5Title = config.name(forTag: "h5") { styleEntries.append(("h5", #selector(MarkupWKWebView.h5Style), h5Title)) }
        if let h6Title = config.name(forTag: "h6") { styleEntries.append(("h6", #selector(MarkupWKWebView.h6Style), h6Title)) }
        if let preTitle = config.name(forTag: "pre") { styleEntries.append(("pre", #selector(MarkupWKWebView.preStyle), preTitle)) }

        let submenu = NSMenu(title: "Style")
        for entry in styleEntries {
            if let label = config.styleMenu[entry.key] {
                let title = label ?? entry.defaultTitle
                submenu.addItem(menuItem(title: title, action: entry.selector, keymapAction: entry.key))
            }
        }

        guard submenu.numberOfItems > 0 else { return nil }
        let item = NSMenuItem(title: "Style", action: nil, keyEquivalent: "")
        item.image = NSImage(systemSymbolName: "paragraphsign", accessibilityDescription: "Style")
        item.submenu = submenu
        return item
    }

    private func buildListItems() -> [NSMenuItem] {
        let bullets = menuItem(title: "Bullets", action: #selector(MarkupWKWebView.bullets), keymapAction: "bullet")
        bullets.image = NSImage(systemSymbolName: "list.bullet", accessibilityDescription: "Bullets")
        let numbers = menuItem(title: "Numbers", action: #selector(MarkupWKWebView.numbers), keymapAction: "number")
        numbers.image = NSImage(systemSymbolName: "list.number", accessibilityDescription: "Numbers")
        return [bullets, numbers]
    }

    private func buildDentItems() -> [NSMenuItem] {
        let indent = menuItem(title: "Indent", action: #selector(MarkupWKWebView.indentFromMenu), keymapAction: "indent")
        indent.image = NSImage(systemSymbolName: "increase.indent", accessibilityDescription: "Indent")
        let outdent = menuItem(title: "Outdent", action: #selector(MarkupWKWebView.outdentFromMenu), keymapAction: "outdent")
        outdent.image = NSImage(systemSymbolName: "decrease.indent", accessibilityDescription: "Outdent")
        return [indent, outdent]
    }

    private func buildFormatItems(from config: ToolbarConfig) -> [NSMenuItem] {
        let items = config.formatBar
        var children = [NSMenuItem]()

        if items["bold"] == true {
            let item = menuItem(title: "Bold", action: #selector(MarkupWKWebView.bold), keymapAction: "bold")
            item.image = NSImage(systemSymbolName: "bold", accessibilityDescription: "Bold")
            children.append(item)
        }
        if items["italic"] == true {
            let item = menuItem(title: "Italic", action: #selector(MarkupWKWebView.italic), keymapAction: "italic")
            item.image = NSImage(systemSymbolName: "italic", accessibilityDescription: "Italic")
            children.append(item)
        }
        if items["underline"] == true {
            let item = menuItem(title: "Underline", action: #selector(MarkupWKWebView.underline), keymapAction: "underline")
            item.image = NSImage(systemSymbolName: "underline", accessibilityDescription: "Underline")
            children.append(item)
        }
        if items["code"] == true {
            let item = menuItem(title: "Code", action: #selector(MarkupWKWebView.code), keymapAction: "code")
            item.image = NSImage(systemSymbolName: "curlybraces", accessibilityDescription: "Code")
            children.append(item)
        }
        if items["strikethrough"] == true {
            let item = menuItem(title: "Strikethrough", action: #selector(MarkupWKWebView.strike), keymapAction: "strikethrough")
            item.image = NSImage(systemSymbolName: "strikethrough", accessibilityDescription: "Strikethrough")
            children.append(item)
        }
        if items["subscript"] == true {
            let item = menuItem(title: "Subscript", action: #selector(MarkupWKWebView.subscriptText), keymapAction: "subscript")
            item.image = NSImage(systemSymbolName: "textformat.subscript", accessibilityDescription: "Subscript")
            children.append(item)
        }
        if items["superscript"] == true {
            let item = menuItem(title: "Superscript", action: #selector(MarkupWKWebView.superscript), keymapAction: "superscript")
            item.image = NSImage(systemSymbolName: "textformat.superscript", accessibilityDescription: "Superscript")
            children.append(item)
        }

        return children
    }
}

extension AppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === openRecentMenu else { return }
        menu.removeAllItems()
        let urls = NSDocumentController.shared.recentDocumentURLs
        if urls.isEmpty {
            let empty = NSMenuItem(title: "No Recent Documents", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        } else {
            for url in urls {
                let item = NSMenuItem(
                    title: url.lastPathComponent,
                    action: #selector(openRecentDocument(_:)),
                    keyEquivalent: ""
                )
                item.representedObject = url
                item.target = self
                let icon = NSWorkspace.shared.icon(forFile: url.path)
                icon.size = NSSize(width: 16, height: 16)
                item.image = icon
                menu.addItem(item)
            }
            menu.addItem(.separator())
        }
        let clearItem = NSMenuItem(
            title: "Clear Menu",
            action: #selector(clearRecentDocuments(_:)),
            keyEquivalent: ""
        )
        clearItem.target = self
        menu.addItem(clearItem)
    }
}
