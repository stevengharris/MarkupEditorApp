//
//  AppConfig.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/7/26.
//

import Foundation
import Observation
import OSLog
import MarkupEditor

@Observable
public final class AppConfig: JSONConfigurable {

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

    public var toolbarVisibility: String
    public var toggledState: String
    public var exporters: [Plugin]
    public var renderers: [Plugin]
    
    public init(
        toolbarVisibility: String,
        toggledState: String,
        exporters: [Plugin]? = nil,
        renderers: [Plugin]? = nil
    ) {
        self.toolbarVisibility = toolbarVisibility
        self.toggledState = toggledState
        self.exporters = exporters ?? []
        self.renderers = renderers ?? []
    }
    
    public init() {
        let config = AppConfig.load()
        toolbarVisibility = config.toolbarVisibility
        toggledState = ToggledState.visible.rawValue
        exporters = config.exporters
        renderers = config.renderers
    }

    public init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey { case toolbarVisibility, toggledState, exporters, renderers }
        let c = try decoder.container(keyedBy: Keys.self)
        toolbarVisibility = try c.decode(String.self, forKey: .toolbarVisibility)
        toggledState = try c.decode(String.self, forKey: .toggledState)
        exporters = try c.decode([Plugin].self, forKey: .exporters)
        renderers = try c.decode([Plugin].self, forKey: .renderers)
    }

    /// Written by hand (rather than relying on synthesis) because `@Observable` renames the
    /// actual stored properties to `_propertyName` and adds `_$observationRegistrar`; synthesized
    /// `Encodable` conformance would encode those instead of the public property names below,
    /// producing JSON that `init(from:)` can't decode back.
    public func encode(to encoder: Encoder) throws {
        enum Keys: String, CodingKey { case toolbarVisibility, toggledState, exporters, renderers }
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(toolbarVisibility, forKey: .toolbarVisibility)
        try c.encode(toggledState, forKey: .toggledState)
        try c.encode(exporters, forKey: .exporters)
        try c.encode(renderers, forKey: .renderers)
    }

    /// The single, process-wide instance. Read its properties directly; use `update(_:)` to mutate and persist.
    public static let shared: AppConfig = loadCurrent()

    /// Mutate `shared` and persist the result to UserDefaults.
    public static func update(_ mutate: (AppConfig) -> Void) {
        mutate(shared)
        shared.persist()
    }

    private func persist() {
        guard let json = asJSON() else {
            assertionFailure("AppConfig encoding failed unexpectedly")
            return
        }
        UserDefaults.standard.set(json, forKey: ConfigKey.app)
    }

    private static func loadCurrent() -> AppConfig {
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
    
    public func pluginFilenames() -> [String] {
        let exporterFilenames = exporters.compactMap { $0.filename }
        let rendererFilenames = renderers.compactMap { $0.filename }
        return exporterFilenames + rendererFilenames
    }

}
