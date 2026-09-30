//
//  PluginDiscoveryView.swift
//  MarkupEditorApp
//

import SwiftUI
import AppKit
import MarkupEditor
import MarkupEditorAppLib

/// Browses the plugin catalog fetched from plugins.json. Always shows one of
/// four explicit states -- loading, content, empty, or failed -- a blank
/// screen is never an acceptable outcome here.
///
/// `onUseFileImporter` is the entry point into the existing manual
/// fileImporter flow, for local/private/unpublished plugins; the actual
/// wiring to PluginSettingsView's "+" buttons happens where this view is
/// presented from.
struct PluginDiscoveryView: View {
    @State private var model = PluginDiscoveryModel()
    var onUseFileImporter: () -> Void = {}

    var body: some View {
        PluginDiscoveryStateView(
            state: model.state,
            onUseFileImporter: onUseFileImporter,
            onRetry: { Task { await model.load() } }
        )
        .task { await model.load() }
        // The Gallery scene has scene restoration disabled (see MarkupEditorApp.swift)
        // so it doesn't reopen on launch, but that also turns off the normal "windows
        // remember where you left them" behavior Mac users expect. NSWindow frame
        // autosave is a separate, older AppKit mechanism from scene restoration --
        // this restores just that part, independent of the disabled behavior.
        .background(WindowFrameAutosave(name: "plugin-gallery"))
    }
}

/// Attaches AppKit's frame-autosave to the hosting window once it's available.
/// Zero-size, renders nothing -- exists purely to reach the NSWindow.
private struct WindowFrameAutosave: NSViewRepresentable {
    let name: String

    func makeNSView(context: Context) -> AutosaveAttachingView {
        let view = AutosaveAttachingView(frame: .zero)
        view.autosaveName = name
        return view
    }

    func updateNSView(_ nsView: AutosaveAttachingView, context: Context) {}
}

/// Applies the frame-autosave name the moment this view attaches to a window --
/// synchronously, before that window is first shown. A DispatchQueue.main.async
/// deferral (waiting a run-loop tick) applies it one frame too late: the window
/// is already visible at its default position by then, so restoring the saved
/// frame afterward produces a visible jump instead of opening in place.
private final class AutosaveAttachingView: NSView {
    var autosaveName: String?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let autosaveName, let window else { return }
        window.setFrameAutosaveName(autosaveName)
    }
}

/// Renders one fixed PluginDiscoveryState. Pulled out of PluginDiscoveryView
/// so each state can be previewed directly, without going through the model's
/// loading -> content/empty/failed transition -- that transition, live inside
/// an Xcode Preview session, was crashing deep in AppKit's List/NSOutlineView
/// bridging (TableViewListCore_Mac2.swift), unrelated to anything in this
/// file. Previewing a fixed state sidesteps the transition entirely.
private struct PluginDiscoveryStateView: View {
    let state: PluginDiscoveryState
    let onUseFileImporter: () -> Void
    var onRetry: () -> Void = {}

    var body: some View {
        switch state {
        case .loading:
            ProgressView("Loading plugins…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .content(let catalog):
            PluginDiscoveryList(catalog: catalog, onUseFileImporter: onUseFileImporter)
        case .empty:
            ContentUnavailableView {
                Label("No Plugins Available", systemImage: "puzzlepiece.extension")
            } description: {
                Text("There are no plugins in the catalog right now.")
            } actions: {
                Button("Add Plugin from File…", action: onUseFileImporter)
            }
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't Load Plugins", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try Again", action: onRetry)
                Button("Add Plugin from File…", action: onUseFileImporter)
            }
        }
    }
}

/// One titled section per plugin type present in the catalog. A section with
/// no entries is skipped rather than shown with an empty title -- the parent
/// view's .empty state already covers "nothing at all," so an empty section
/// here would only happen if just one type has zero plugins while the other
/// doesn't, which reads better as "not shown" than as a header over nothing.
private struct PluginDiscoveryList: View {
    let catalog: PluginCatalog
    let onUseFileImporter: () -> Void

    var body: some View {
        List {
            if !catalog.codeview.isEmpty {
                Section("Code Views") {
                    ForEach(sortedByName(catalog.codeview)) { entry in
                        PluginDiscoveryRow(entry: entry, type: .codeview, alreadyInstalled: CodeViewManager.nameExists(entry.name, in: AppConfig.shared.codeViews))
                    }
                }
            }
            if !catalog.exporter.isEmpty {
                Section("Exporters") {
                    ForEach(sortedByName(catalog.exporter)) { entry in
                        PluginDiscoveryRow(entry: entry, type: .exporter, alreadyInstalled: ExporterManager.nameExists(entry.name, in: AppConfig.shared.exporters))
                    }
                }
            }
            Section {
                Button("Add Plugin from File…", action: onUseFileImporter)
            }
        }
        // Default List styling renders the first section's header/divider
        // full-bleed (heavier, edge-to-edge) while later sections get the
        // normal inset divider. .plain makes every section render the same
        // regardless of position.
        .listStyle(.plain)
        // List also gives the first section less top breathing room than the
        // gap between later sections by default; this normalizes that too.
        .contentMargins(.top, 8, for: .scrollContent)
    }

    private func sortedByName(_ entries: [String: PluginCatalogEntry]) -> [PluginCatalogEntry] {
        entries.values.sorted { $0.name < $1.name }
    }
}

private struct PluginDiscoveryRow: View {
    let entry: PluginCatalogEntry
    let type: PluginType
    let alreadyInstalled: Bool

    @State private var isInstalling = false
    @State private var installErrorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(entry.name)
                    .font(.headline)
                if alreadyInstalled {
                    Label("Installed", systemImage: "checkmark.circle.fill")
                        .labelStyle(.titleAndIcon)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isInstalling {
                    ProgressView()
                        .controlSize(.small)
                } else if !alreadyInstalled {
                    Button("Install", action: install)
                        .controlSize(.small)
                }
            }
            Text(entry.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let installErrorMessage {
                Text(installErrorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            HStack {
                Text("\(entry.author) · v\(entry.version)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                // repo is guaranteed https:// by PluginCatalog's decode, but URL(string:)
                // can still fail on malformed characters, so this stays a real guard.
                if let repoURL = URL(string: entry.repo) {
                    Link("Source", destination: repoURL)
                        .font(.caption)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func install() {
        installErrorMessage = nil
        isInstalling = true
        Task {
            defer { isInstalling = false }
            do {
                let (exporters, codeViews) = try await installPlugin(
                    entry, type: type,
                    exporters: AppConfig.shared.exporters,
                    codeViews: AppConfig.shared.codeViews,
                    cacheDir: AppDelegate.webViewCacheDir
                )
                // alreadyInstalled is recomputed by the parent from AppConfig's own
                // @Observable-backed state, updated here from installPlugin's result.
                AppConfig.update { config in
                    config.exporters = exporters
                    config.codeViews = codeViews
                    config.pluginsRevision += 1
                }
            } catch {
                installErrorMessage = error.localizedDescription
            }
        }
    }
}

// Fixed-state previews render PluginDiscoveryStateView directly, bypassing
// PluginDiscoveryModel's loading -> target-state transition entirely -- see
// PluginDiscoveryStateView's doc comment for why that transition is unsafe
// to trigger live inside a Preview session right now.

#Preview("Loading") {
    PluginDiscoveryStateView(state: .loading, onUseFileImporter: {})
}

#Preview("Content") {
    let json = """
    {
      "codeview": {
        "Mermaid": {
          "name": "Mermaid", "filename": "m.js",
          "description": "MarkupEditor codeview plugin for Mermaid diagrams.",
          "author": "Steven G. Harris", "version": "1.0.0",
          "repo": "https://github.com/stevengharris/MarkupEditorApp", "source": "https://example.com/s.js"
        }
      },
      "exporter": {
        "DocX": {
          "name": "DocX", "filename": "d.js", "ext": "docx",
          "description": "MarkupEditor exporter plugin for DOCX.",
          "author": "Steven G. Harris", "version": "0.1.0",
          "repo": "https://github.com/stevengharris/MarkupEditorApp", "source": "https://example.com/s.js"
        }
      }
    }
    """
    // try! is fine in a Preview -- fixture data, not a production path.
    let catalog = try! JSONDecoder().decode(PluginCatalog.self, from: Data(json.utf8))
    return PluginDiscoveryStateView(state: .content(catalog), onUseFileImporter: {})
}

#Preview("Empty") {
    PluginDiscoveryStateView(state: .empty, onUseFileImporter: {})
}

#Preview("Failed") {
    PluginDiscoveryStateView(
        state: .failed("Could not reach the plugin catalog: The Internet connection appears to be offline."),
        onUseFileImporter: {}
    )
}

// The real, network-driven view. Exhibits the same loading -> content
// transition the fixed-state previews above deliberately avoid, so this one
// may still hit the Preview-session crash until Apple's tooling issue clears.
#Preview("Live (network)") {
    PluginDiscoveryView()
}
