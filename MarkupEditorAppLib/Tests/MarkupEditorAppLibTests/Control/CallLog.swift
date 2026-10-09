//
//  CallLog.swift
//  MarkupEditorAppLibTests
//

import Synchronization

/// Records values from `@Sendable` closures so a test can assert on them afterward.
final class CallLog<Element: Sendable>: Sendable {
    private let storage = Mutex<[Element]>([])
    func append(_ element: Element) { storage.withLock { $0.append(element) } }
    var all: [Element] { storage.withLock { $0 } }
}
