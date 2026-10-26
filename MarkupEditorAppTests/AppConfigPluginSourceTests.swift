//
//  AppConfigPluginSourceTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorApp

@MainActor
struct AppConfigPluginSourceTests {

    @Test func aConfigSavedWithoutPluginSourcesDecodesWithNone() throws {
        let json = #"{"toolbarVisibility":"toggled","toggledState":"visible","exporters":[],"codeViews":[]}"#
        let config = try #require(AppConfig.fromJSON(json) as? AppConfig)
        #expect(config.pluginVersions.isEmpty)
        #expect(config.filePlugins.isEmpty)
    }

    @Test func pluginSourcesSurviveEncodingAndDecoding() throws {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible")
        config.pluginVersions = ["codeview/Mermaid": "1.0.0"]
        config.filePlugins = ["exporter/Custom"]
        let json = try #require(config.asJSON())

        let decoded = try #require(AppConfig.fromJSON(json) as? AppConfig)

        #expect(decoded.pluginVersions == ["codeview/Mermaid": "1.0.0"])
        #expect(decoded.filePlugins == ["exporter/Custom"])
    }

    @Test func aCatalogInstallRecordsTheVersionAndClearsTheFileSource() {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible")
        config.recordFileInstall(key: "codeview/GeoJSON")

        config.recordCatalogInstall(key: "codeview/GeoJSON", version: "1.0.0")

        #expect(config.pluginVersions["codeview/GeoJSON"] == "1.0.0")
        #expect(!config.filePlugins.contains("codeview/GeoJSON"))
    }

    @Test func aFileInstallMarksTheSourceAndForgetsTheCatalogVersion() {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible")
        config.recordCatalogInstall(key: "codeview/GeoJSON", version: "1.0.0")

        config.recordFileInstall(key: "codeview/GeoJSON")

        #expect(config.pluginVersions["codeview/GeoJSON"] == nil)
        #expect(config.filePlugins.contains("codeview/GeoJSON"))
    }

    @Test func anUninstallForgetsHowThePluginWasInstalled() {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible")
        config.recordCatalogInstall(key: "exporter/DocX", version: "0.1.0")
        config.recordFileInstall(key: "codeview/GeoJSON")

        config.recordUninstall(key: "exporter/DocX")
        config.recordUninstall(key: "codeview/GeoJSON")

        #expect(config.pluginVersions.isEmpty)
        #expect(config.filePlugins.isEmpty)
    }
}
