//
//  NSColor+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/27/26.
//
import AppKit

extension NSColor {
    /// Returns a dynamic color that selects between light and dark CSS color strings at draw time.
    static func dynamic(light: String, dark: String) -> NSColor {
        NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(cssColor: isDark ? dark : light) ?? .clear
        }
    }

    /// Initializes an NSColor from a CSS color string.
    /// Supports #RGB, #RRGGBB, #RRGGBBAA, rgb(r,g,b), and rgba(r,g,b,a).
    convenience init?(cssColor: String) {
        let s = cssColor.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") {
            var hex = String(s.dropFirst())
            switch hex.count {
            case 3:
                hex = hex.map { "\($0)\($0)" }.joined()
            case 6, 8:
                break
            default:
                return nil
            }
            guard let value = UInt64(hex, radix: 16) else { return nil }
            let r, g, b, a: CGFloat
            if hex.count == 6 {
                r = CGFloat((value >> 16) & 0xFF) / 255
                g = CGFloat((value >> 8)  & 0xFF) / 255
                b = CGFloat( value        & 0xFF) / 255
                a = 1
            } else {
                r = CGFloat((value >> 24) & 0xFF) / 255
                g = CGFloat((value >> 16) & 0xFF) / 255
                b = CGFloat((value >> 8)  & 0xFF) / 255
                a = CGFloat( value        & 0xFF) / 255
            }
            self.init(red: r, green: g, blue: b, alpha: a)
        } else if s.hasPrefix("rgb") {
            let inner = s
                .drop(while: { $0 != "(" }).dropFirst()
                .prefix(while: { $0 != ")" })
            let parts = inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count == 3 || parts.count == 4,
                  let r = Double(parts[0]),
                  let g = Double(parts[1]),
                  let b = Double(parts[2]) else { return nil }
            let a = parts.count == 4 ? (Double(parts[3]) ?? 1.0) : 1.0
            self.init(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
        } else {
            return nil
        }
    }
}
