//
//  BundledPluginBannerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

/// The Swift side hard-codes the names of the plugins it pre-installs. These tests read the
/// banners of the real built plugins in this repo, so a rename on either side fails here
/// instead of surfacing as a plugin that silently never runs.
private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()
private let pluginsDir = repoRoot.appendingPathComponent("plugins")
private let pluginsPresent = FileManager.default.fileExists(atPath: pluginsDir.path(percentEncoded: false))

private func distURL(for filename: String) -> URL {
    let dir = filename.replacingOccurrences(of: ".js", with: "")
    return pluginsDir.appendingPathComponent(dir).appendingPathComponent("dist").appendingPathComponent(filename)
}

@Suite(.enabled(if: pluginsPresent))
struct BundledPluginBannerTests {

    @Test func everyBuiltPluginCarriesAReadableBanner() throws {
        let fileManager = FileManager.default
        let plugins = try fileManager.contentsOfDirectory(atPath: pluginsDir.path(percentEncoded: false))
        var checked = 0
        for dir in plugins.sorted() {
            let pluginDir = pluginsDir.appendingPathComponent(dir)
            guard fileManager.fileExists(atPath: pluginDir.appendingPathComponent("package.json").path(percentEncoded: false)) else { continue }
            let dist = pluginDir.appendingPathComponent("dist").appendingPathComponent("\(dir).js")
            #expect(fileManager.fileExists(atPath: dist.path(percentEncoded: false)), "\(dir) has no built dist")
            _ = try PluginBanner.read(from: dist)
            checked += 1
        }
        #expect(checked > 0, "no plugin directories were found to check")
    }

    @Test func swiftDefaultsAgreeWithTheBuiltBanners() throws {
        var defaults: [Plugin] = [ExporterManager.docx, CodeViewManager.mermaid]
        defaults += CodeViewManager.InternalCodeView.allCases.map(\.plugin)
        for plugin in defaults {
            let filename = try #require(plugin.filename)
            let banner = try PluginBanner.read(from: distURL(for: filename))
            #expect(banner.name == plugin.name, "\(filename): banner says \(banner.name), Swift says \(plugin.name)")
            #expect(banner.kind.rawValue == plugin.type, "\(filename): banner kind \(banner.kind.rawValue), Swift type \(plugin.type)")
            #expect(banner.ext == plugin.ext, "\(filename): banner ext \(String(describing: banner.ext)), Swift ext \(String(describing: plugin.ext))")
        }
    }
}
