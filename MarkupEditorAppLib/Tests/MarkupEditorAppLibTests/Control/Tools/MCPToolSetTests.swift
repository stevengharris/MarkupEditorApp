//
//  MCPToolSetTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import MarkupEditorAppLib

/// Pins the tools offered to assistants, so adding one, whatever its purpose, fails here and forces a decision.
struct MCPToolSetTests {

    private let endUserNames: Set<String> = [
        "get_document", "get_selection", "select", "replace_blocks", "propose_edits",
        "list_suggestions", "undo", "redo", "save_document",
    ]

    private let developerNames: Set<String> = [
        "app_state", "run_menu_command", "eval_js", "get_markdown", "get_html", "type_text", "screenshot_editor",
    ]

    @Test func theToolsShippedInEveryBuildAreExactlyTheKnownSet() {
        #expect(Set(ControlTools.endUser.map(\.name)) == endUserNames)
        #expect(ControlTools.endUser.count == endUserNames.count)
    }

    @Test func theToolsOfADebugBuildAreTheKnownSetPlusTheDeveloperTools() {
        #expect(Set(ControlTools.all.map(\.name)) == endUserNames.union(developerNames))
        #expect(ControlTools.all.count == endUserNames.count + developerNames.count)
    }

    @Test func noToolNameOrDescriptionMentionsActions() {
        for tool in ControlTools.all {
            #expect(!tool.name.localizedCaseInsensitiveContains("action"), "\(tool.name)")
            #expect(!tool.description.localizedCaseInsensitiveContains("action"), "\(tool.name): \(tool.description)")
        }
    }

    @Test func theMenuCommandsTheToolOffersAreExactlyTheKnownList() throws {
        let tool = try #require(ControlTools.all.first { $0.name == "run_menu_command" })
        let afterColon = try #require(tool.description.components(separatedBy: "by name: ").last)
        let list = try #require(afterColon.components(separatedBy: " (").first)
        let names = list.components(separatedBy: ", ")
        #expect(names == ["new", "open", "save", "saveAs", "toggleSource", "showSettings", "closeWindow"])
    }
}
