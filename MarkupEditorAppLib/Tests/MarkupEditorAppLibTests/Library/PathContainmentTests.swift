//
//  PathContainmentTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct PathContainmentTests {

    private func url(_ path: String) -> URL { URL(fileURLWithPath: path) }

    @Test func aPathBelowTheFolderIsInside() {
        #expect(PathContainment.isInside(url("/tmp/a/b/c.png"), of: url("/tmp/a")))
        #expect(PathContainment.isInside(url("/tmp/a/c.png"), of: url("/tmp/a/")))
    }

    @Test func theFolderItselfALookalikeAndAParentAreNotInside() {
        #expect(!PathContainment.isInside(url("/tmp/a"), of: url("/tmp/a")))
        #expect(!PathContainment.isInside(url("/tmp/ab/c.png"), of: url("/tmp/a")))
        #expect(!PathContainment.isInside(url("/tmp/c.png"), of: url("/tmp/a")))
    }

    @Test func dotDotComponentsAreResolved() {
        #expect(!PathContainment.isInside(url("/tmp/a/../c.png"), of: url("/tmp/a")))
        #expect(PathContainment.isInside(url("/tmp/a/b/../c.png"), of: url("/tmp/a")))
        #expect(!PathContainment.isInside(url("/tmp/a/b/../../../c.png"), of: url("/tmp/a")))
    }

    @Test func privateAndShortSpellingsOfTheSameFolderAgree() {
        // A file that does not exist yet keeps /private under URL standardization, while its existing folder loses it.
        #expect(PathContainment.isInside(url("/private/tmp/x/new.png"), of: url("/tmp/x")))
        #expect(PathContainment.isInside(url("/tmp/x/new.png"), of: url("/private/tmp/x")))
        #expect(PathContainment.isInside(url("/private/var/folders/q/new.png"), of: url("/var/folders/q")))
        #expect(!PathContainment.isInside(url("/private/tmp/y/new.png"), of: url("/tmp/x")))
    }

    @Test func aFileThatDoesNotExistYetIsTreatedLikeOneThatDoes() throws {
        let folder = URL(fileURLWithPath: "/private/tmp/PathContainmentTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("new.png")
        let before = PathContainment.isInside(file, of: folder)
        FileManager.default.createFile(atPath: file.path, contents: Data())
        #expect(before)
        #expect(PathContainment.isInside(file, of: folder) == before)
    }
}
