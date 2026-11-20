//
//  CurrentDocumentPublisher.swift
//  MarkupEditorApp
//

import AppKit
import Observation
import MarkupEditorAppLib

/// Keeps the file `markup current` reads in step with the document being edited. It follows whichever
/// document was last attached, so a change of document, such as switching tabs, is one `attach` call.
@MainActor
final class CurrentDocumentPublisher {

    private let file: CurrentDocumentFile
    private let pid: Int32
    private let now: () -> Date
    private let center: NotificationCenter
    private var document: MarkupDocument?
    private var attached = false
    private var stopped = false
    private var generation = 0
    private var observers: [any NSObjectProtocol] = []

    init(file: CurrentDocumentFile, pid: Int32 = ProcessInfo.processInfo.processIdentifier,
         now: @escaping () -> Date = { Date() }, center: NotificationCenter = .default) {
        self.file = file
        self.pid = pid
        self.now = now
        self.center = center
        observers = [
            center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.publish() }
            },
            center.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.stop() }
            },
        ]
    }

    /// Makes `document` the one published, and publishes it. A nil document is published as untitled.
    func attach(_ document: MarkupDocument?) {
        guard !stopped else { return }
        self.document = document
        attached = true
        generation += 1
        publish()
        track(document, generation: generation)
    }

    /// Removes the file when this process wrote it, and publishes nothing afterwards.
    func stop() {
        stopped = true
        if file.load()?.pid == pid { file.remove() }
        observers.forEach { center.removeObserver($0) }
        observers = []
    }

    private func publish() {
        guard attached, !stopped else { return }
        let path = document?.url?.path(percentEncoded: false)
        let state = CurrentDocumentState(path: path, modified: document?.hasChanges ?? false, pid: pid, updated: now())
        do {
            try file.write(state)
        } catch {
            EditLog.shared.warning("The current document could not be published: \(error.localizedDescription)", category: "Shortcuts", once: "currentdocument:write")
        }
    }

    private func track(_ document: MarkupDocument?, generation: Int) {
        guard let document else { return }
        withObservationTracking {
            _ = document.url
            _ = document.hasChanges
        } onChange: { [weak self, weak document] in
            Task { @MainActor in
                guard let self, let document, self.generation == generation, !self.stopped else { return }
                self.publish()
                self.track(document, generation: generation)
            }
        }
    }
}
