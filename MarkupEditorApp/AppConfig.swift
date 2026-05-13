//
//  AppConfig.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/7/26.
//

import Foundation
import OSLog
import MarkupEditor

public struct AppConfig: JSONConfigurable {

    // Keys used to store config JSON in UserDefaults.standard
    public enum ConfigKey {
        static let toolbar = "toolbarConfigJSON"
        static let keymap = "keymapConfigJSON"
        static let behavior = "behaviorConfigJSON"
        static let app = "appConfigJSON"
    }

    public enum ToolbarVisibility: String, CaseIterable, Identifiable {
        case toggled, hidden, visible
        public var id: Self { self }
    }
    
    public enum ToggledState: String {
        case hidden, visible
    }
    
    public var toolbarVisibility: String
    public var toggledState: String
    
    public init(toolbarVisibility: String, toggledState: String) {
        self.toolbarVisibility = toolbarVisibility
        self.toggledState = toggledState
    }
    
    public init() {
        let config = AppConfig.load()
        toolbarVisibility = config.toolbarVisibility
        toggledState = ToggledState.visible.rawValue
    }
    
    public static func fromDefaults() -> AppConfig {
        let defaults = UserDefaults.standard
        if let json = defaults.string(forKey: ConfigKey.app), let config = AppConfig.fromJSON(json) {
            return config
        } else {
            return AppConfig()
        }
    }
    
    private static func load() -> AppConfig {
        let mainBundle = Bundle.main
        guard let path = mainBundle.path(forResource: "appconfig", ofType: "json") else {
            Logger.config.error("The appconfig.json resource could not be found in bundle")
            return AppConfig.empty()
        }
        let url = URL(filePath: path, directoryHint: .notDirectory)
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(AppConfig.self, from: data)
        } catch let error {
            Logger.config.error("Error decoding AppConfig from \(path): \(error.localizedDescription)")
            return AppConfig.empty()
        }
    }
    
    private static func privateFromJSON(_ string: String) -> AppConfig? {
        (self as JSONConfigurable.Type).fromJSON(string) as? AppConfig
    }

    private static func empty() -> AppConfig {
        AppConfig(
            toolbarVisibility: "\(ToolbarVisibility.toggled)",
            toggledState: "\(ToggledState.visible)"
        )
    }
    
    /// Override the protocol default to return `none()` on decode failure instead of nil.
    public static func fromJSON(_ string: String) -> AppConfig {
        privateFromJSON(string) ?? empty()
    }
    
    public func isToggled() -> Bool {
        toolbarVisibility == ToolbarVisibility.toggled.rawValue
    }
    
    /// Return whether the toolbar is hidden based on the toolbarVisibility and toggledState.
    /// If toolbarVisibility is hidden, then the toolbar is always hidden.
    /// If the toolbarVisibility is toggled and toggledState is hidden, then the toolbar is currently hidden.
    /// If neither of these is true, then it is not hidden, because it is either always visible or toggled and visible.
    public func isHidden() -> Bool {
        toolbarVisibility ==
            ToolbarVisibility.hidden.rawValue ||
            (isToggled() && toggledState == ToggledState.hidden.rawValue)
    }

}

extension ToolbarConfig {
    
    static func fromDefaults() -> ToolbarConfig {
        let defaults = UserDefaults.standard
        if let json = defaults.string(forKey: AppConfig.ConfigKey.toolbar), let config = ToolbarConfig.fromJSON(json) {
            return config
        } else {
            return ToolbarConfig()
        }
    }

}

extension KeymapConfig {
    
    static func fromDefaults() -> KeymapConfig {
        
        let defaults = UserDefaults.standard
        if let json = defaults.string(forKey: AppConfig.ConfigKey.keymap), let config = KeymapConfig.fromJSON(json) {
            return config
        } else {
            return KeymapConfig()
        }
    }
}

extension BehaviorConfig {
    
    static func fromDefaults() -> BehaviorConfig {
        
        let defaults = UserDefaults.standard
        if let json = defaults.string(forKey: AppConfig.ConfigKey.behavior), let config = BehaviorConfig.fromJSON(json) {
            return config
        } else {
            return BehaviorConfig()
        }
    }
}
