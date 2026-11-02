//
//  KeymapConfig+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/9/26.
//

import Foundation
import MarkupEditor

extension KeymapConfig {
    
    static func fromDefaults() -> KeymapConfig {
        
        let defaults = UserDefaults.standard
        if let json = defaults.string(forKey: AppConfig.ConfigKey.keymap), let config = KeymapConfig.fromJSON(json) {
            return merging(config, into: KeymapConfig())
        } else {
            return KeymapConfig()
        }
    }

    /// `saved` with any action it lacks taken from `defaults`, so an action added to the bundled keymapconfig.json
    /// reaches a user who saved a keymap before it existed. An action the user cleared is kept, since its empty
    /// binding is present.
    static func merging(_ saved: KeymapConfig, into defaults: KeymapConfig) -> KeymapConfig {
        var merged = saved
        for (action, bindings) in defaults.bindings where merged.bindings[action] == nil {
            merged.bindings[action] = bindings
        }
        return merged
    }
}
