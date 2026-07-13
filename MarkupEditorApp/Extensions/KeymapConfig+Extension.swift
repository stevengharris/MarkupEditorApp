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
            return config
        } else {
            return KeymapConfig()
        }
    }
}
