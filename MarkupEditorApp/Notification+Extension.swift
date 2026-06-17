//
//  Notification+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/12/26.
//
import Foundation

extension Notification.Name {
    static let menuNewDocument = Notification.Name("menuNewDocument")
    static let menuOpenDocument = Notification.Name("menuOpenDocument")
    static let menuSaveDocument = Notification.Name("menuSaveDocument")
    static let menuSaveAsDocument = Notification.Name("menuSaveAsDocument")
    static let menuShowSource = Notification.Name("menuShowSource")
    static let menuOpenRecentDocument = Notification.Name("menuOpenRecentDocument")
    static let menuShowSettings = Notification.Name("menuShowSettings")
    static let dismissSettings = Notification.Name("dismissSettings")
    static let menuQuitApplication = Notification.Name("menuQuitApplication")
    static let menuExportPlugin = Notification.Name("menuExportPlugin")
    static let menuImportPlugin = Notification.Name("menuImportPlugin")
#if DEBUG
    static let menuClearUserDefaults = Notification.Name("menuClearUserDefaults")
#endif
}
