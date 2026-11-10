//
//  Notification+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/12/26.
//
import Foundation

extension Notification.Name {
    static let menuNewDocument = Notification.Name("menuNewDocument")
    static let menuNewFromTemplate = Notification.Name("menuNewFromTemplate")
    static let menuSaveAsTemplate = Notification.Name("menuSaveAsTemplate")
    /// Posted after a template is added, so the Templates panel can reload.
    static let templatesDidChange = Notification.Name("templatesDidChange")
    static let menuOpenDocument = Notification.Name("menuOpenDocument")
    static let menuSaveDocument = Notification.Name("menuSaveDocument")
    /// Posted after the keymap is saved in Settings, so the menu can pick up the new shortcuts.
    static let keymapDidChange = Notification.Name("keymapDidChange")
    static let menuSaveAsDocument = Notification.Name("menuSaveAsDocument")
    static let menuToggleSource = Notification.Name("menuToggleSource")
    /// Posted with the URL of a document to open after the usual check for unsaved changes.
    static let openDocumentURL = Notification.Name("openDocumentURL")
    static let menuShowAbout = Notification.Name("menuShowAbout")
    static let showReleaseNotes = Notification.Name("showReleaseNotes")
    static let menuOpenRecentDocument = Notification.Name("menuOpenRecentDocument")
    static let menuShowSettings = Notification.Name("menuShowSettings")
    static let dismissSettings = Notification.Name("dismissSettings")
    static let menuQuitApplication = Notification.Name("menuQuitApplication")
    static let menuExport = Notification.Name("menuExport")
#if DEBUG
    static let menuClearUserDefaults = Notification.Name("menuClearUserDefaults")
    static let menuClearCacheDir = Notification.Name("menuClearCacheDir")
    static let resetWelcome = Notification.Name("resetWelcome")
    static let setExpired = Notification.Name("setExpired")
    static let setUnexpired = Notification.Name("setUnexpired")
#endif
}
