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
    public var codeViews: [Plugin]
    public var spellcheck: Bool
    public var inlinePredictions: Bool
    public var autocorrect: Bool
    // Bumped on every plugin install/delete (PluginSettingsView/PluginDiscoveryView) so
    // MarkupDocumentView's .onChange always sees a change. Plugin equality only compares
    // name/type/filename, so reinstalling with the same name but different bytes leaves the
    // exporters/codeViews array Equatable-equal -- onChange would otherwise skip the reload,
    // leaving a stale copy running. Not persisted: a fresh launch rebuilds from scratch anyway.
    public var pluginsRevision: Int = 0

    public init(
        toolbarVisibility: String,
        toggledState: String,
        exporters: [Plugin]? = nil,
        codeViews: [Plugin]? = nil,
        spellcheck: Bool = true,
        inlinePredictions: Bool = true,
        autocorrect: Bool = true
    ) {
        self.toolbarVisibility = toolbarVisibility
        self.toggledState = toggledState
        self.exporters = exporters ?? []
        self.codeViews = codeViews ?? []
        self.spellcheck = spellcheck
        self.inlinePredictions = inlinePredictions
        self.autocorrect = autocorrect
    }

    public init() {
        let config = AppConfig.load()
        toolbarVisibility = config.toolbarVisibility
        toggledState = ToggledState.visible.rawValue
        exporters = config.exporters
        codeViews = config.codeViews
        spellcheck = config.spellcheck
        inlinePredictions = config.inlinePredictions
        autocorrect = config.autocorrect
    }

    public init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey {
            case toolbarVisibility, toggledState, exporters, codeViews, spellcheck, inlinePredictions, autocorrect
        }
        let c = try decoder.container(keyedBy: Keys.self)
        toolbarVisibility = try c.decode(String.self, forKey: .toolbarVisibility)
        toggledState = try c.decode(String.self, forKey: .toggledState)
        exporters = try c.decode([Plugin].self, forKey: .exporters)
        codeViews = try c.decode([Plugin].self, forKey: .codeViews)
        spellcheck = try c.decodeIfPresent(Bool.self, forKey: .spellcheck) ?? true
        inlinePredictions = try c.decodeIfPresent(Bool.self, forKey: .inlinePredictions) ?? true
        autocorrect = try c.decodeIfPresent(Bool.self, forKey: .autocorrect) ?? true
    }

    /// Written by hand (rather than relying on synthesis) because `@Observable` renames the
    /// actual stored properties to `_propertyName` and adds `_$observationRegistrar`; synthesized
    /// `Encodable` conformance would encode those instead of the public property names below,
    /// producing JSON that `init(from:)` can't decode back.
    public func encode(to encoder: Encoder) throws {
        enum Keys: String, CodingKey {
            case toolbarVisibility, toggledState, exporters, codeViews, spellcheck, inlinePredictions, autocorrect
        }
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(toolbarVisibility, forKey: .toolbarVisibility)
        try c.encode(toggledState, forKey: .toggledState)
        try c.encode(exporters, forKey: .exporters)
        try c.encode(codeViews, forKey: .codeViews)
        try c.encode(spellcheck, forKey: .spellcheck)
        try c.encode(inlinePredictions, forKey: .inlinePredictions)
        try c.encode(autocorrect, forKey: .autocorrect)
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
        let codeViewFilenames = codeViews.compactMap { $0.filename }
        return exporterFilenames + codeViewFilenames
    }

    public func topLevelAttributes() -> EditableAttributes {
        var attributes: EditableAttributes = [.contenteditable]
        if spellcheck { attributes.insert(.spellcheck) }
        if autocorrect { attributes.insert(.autocorrect) }
        return attributes
    }

}
