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

    // Keys used in UserDefaults.standard for configuration JSON
    public enum ConfigKey {
        static let toolbar = "toolbarConfigJSON"    // Local values for toolbarconfig.json
        static let keymap = "keymapConfigJSON"      // Local values for keymapconfig.json
        static let behavior = "behaviorConfigJSON"  // Local values for behaviorconfig.json
        static let app = "appConfigJSON"            // Local values for appconfig.json
    }

    public enum ToolbarVisibility: String, CaseIterable, Identifiable {
        case toggled, hidden, visible
        public var id: Self { self }
    }
    
    public enum ToggledState: String {
        case hidden, visible
    }

    /// A single plugin entry as recorded in appconfig.json.
    /// `filename` is a bare filename (e.g. "markup-editor-markdown.js"); the app
    /// resolves it to a full bundle path at runtime when building the plugin configuration.
    public struct PluginConfigEntry: Codable {
        public let name: String           // JS registry key for invokePlugin
        public let filename: String       // JS bundle filename
        public let fileExtension: String? // e.g. "md"; nil = backward-compatible

        public init(name: String, filename: String, fileExtension: String? = nil) {
            self.name = name
            self.filename = filename
            self.fileExtension = fileExtension
        }
    }

    public var toolbarVisibility: String
    public var toggledState: String
    /// Optional array of plugins to load. Nil when the key is absent from the JSON,
    /// which allows older appconfig.json files to decode cleanly (backward compatible).
    public var plugins: [PluginConfigEntry]? = nil
    
    public init(toolbarVisibility: String, toggledState: String, plugins: [PluginConfigEntry]? = nil) {
        self.toolbarVisibility = toolbarVisibility
        self.toggledState = toggledState
        self.plugins = plugins
    }
    
    public init() {
        let config = AppConfig.load()
        toolbarVisibility = config.toolbarVisibility
        toggledState = ToggledState.visible.rawValue
        plugins = config.plugins
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

    /// Resolves plugin config entries into `PluginFileEntry` values by appending each
    /// filename to `pluginDir` and checking for file existence.
    ///
    /// Missing files are logged and skipped; no error is thrown.
    ///
    /// - Parameters:
    ///   - entries: The plugin entries from `AppConfig.plugins`. Pass `nil` or an empty
    ///     array to get an empty result.
    ///   - pluginDir: The directory to resolve filenames against (typically
    ///     `PluginSetup.defaultPluginDir`).
    /// - Returns: An array of `PluginFileEntry` values for files that exist on disk.
    public static func pluginFiles(
        from entries: [PluginConfigEntry]?,
        pluginDir: URL
    ) -> [PluginFileEntry] {
        guard let entries, !entries.isEmpty else { return [] }
        var result: [PluginFileEntry] = []
        for entry in entries {
            let fileURL = pluginDir.appendingPathComponent(entry.filename)
            guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else {
                Logger.config.error("Plugin file not found at \(fileURL.path(percentEncoded: false)) — skipping \(entry.filename)")
                continue
            }
            result.append(PluginFileEntry(name: entry.name, path: fileURL.path(percentEncoded: false)))
        }
        return result
    }

}

extension AppConfig {
    public nonisolated init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey { case toolbarVisibility, toggledState, plugins }
        let c = try decoder.container(keyedBy: Keys.self)
        toolbarVisibility = try c.decode(String.self, forKey: .toolbarVisibility)
        toggledState = try c.decode(String.self, forKey: .toggledState)
        plugins = try c.decodeIfPresent([PluginConfigEntry].self, forKey: .plugins)
    }
}

extension AppConfig.PluginConfigEntry {
    public nonisolated init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey { case name, filename, fileExtension }
        let c = try decoder.container(keyedBy: Keys.self)
        name = try c.decode(String.self, forKey: .name)
        filename = try c.decode(String.self, forKey: .filename)
        fileExtension = try c.decodeIfPresent(String.self, forKey: .fileExtension)
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
