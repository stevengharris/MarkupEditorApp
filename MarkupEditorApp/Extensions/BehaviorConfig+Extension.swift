//
//  BehaviorConfig+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/9/26.
//

import Foundation
import MarkupEditor

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
