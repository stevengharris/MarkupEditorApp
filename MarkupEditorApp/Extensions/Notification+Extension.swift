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
    static let menuToggleSource = Notification.Name("menuToggleSource")
    static let menuOpenRecentDocument = Notification.Name("menuOpenRecentDocument")
    static let menuShowSettings = Notification.Name("menuShowSettings")
    static let dismissSettings = Notification.Name("dismissSettings")
    static let menuQuitApplication = Notification.Name("menuQuitApplication")
    static let menuExport = Notification.Name("menuExport")
#if DEBUG
    static let menuClearUserDefaults = Notification.Name("menuClearUserDefaults")
    static let menuClearCacheDir = Notification.Name("menuClearCacheDir")
    static let resetTour = Notification.Name("resetTour")
    static let setExpired = Notification.Name("setExpired")
    static let setUnexpired = Notification.Name("setUnexpired")
#endif
}
