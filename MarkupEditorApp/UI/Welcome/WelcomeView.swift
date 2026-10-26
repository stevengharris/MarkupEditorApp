//
//  WelcomeView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 10/19/26.
//

import SwiftUI
import MarkupEditorAppLib

struct WelcomeView: View {
    
    @AppStorage(MarkupEditorApp.hasSeenWelcomeKey) private var hasSeenWelcome = false
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow
    @Environment(EditLog.self) private var editLog
    private enum Page {
        case thanks, editing, plugins
    }

    @State private var page = Page.thanks
    @State private var plugins = PluginsWelcomeModel()
    // Fixed when the welcome is created, so the text and Next behavior can't change mid-display.
    @State private var expirationDate: Date?
    @State private var isExpired: Bool

    var body: some View {
        VStack(spacing: 16) {
            // All pages stay in the layout so the window is always as tall as the tallest one.
            ZStack {
                ThanksView(variant: BuildVariant.current, expirationDate: expirationDate, isExpired: isExpired)
                    .pageVisibility(page == .thanks)
                // The pages with a description and a box are aligned at the top, so their text lines up.
                EditingWelcomeView()
                    .frame(maxHeight: .infinity, alignment: .top)
                    .pageVisibility(page == .editing)
                PluginsWelcomeView(model: plugins)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .pageVisibility(page == .plugins)
            }
            HStack {
                Button("Next") {
                    if isExpired {
                        AppDelegate.upgradeOnly = true
                        openWindow(id: "upgrade")
                        dismissWindow(id: "welcome")
                    } else {
                        next()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(plugins.isInstalling)
            }
        }
        .padding(20)
        .frame(width: 460)
        .onAppear {
            plugins.editLog = editLog
            // No document view exists to answer the unsaved-changes check a quit normally waits for.
            AppDelegate.skipTerminateCheck = true
        }
    }

    private func next() {
        switch page {
        case .thanks:
            page = .editing
        case .editing:
            page = .plugins
        case .plugins:
            Task {
                // Failures stay on the page once, so they can be read before moving on.
                if !plugins.failuresShown {
                    await plugins.installSelected()
                    if !plugins.failures.isEmpty {
                        plugins.failuresShown = true
                        return
                    }
                }
                finish()
            }
        }
    }

    private func finish() {
        hasSeenWelcome = true
        // The document window answers the unsaved-changes check from here on.
        AppDelegate.skipTerminateCheck = false
        AppDelegate.pendingWelcomeDocument = true
        openWindow(id: MarkupEditorApp.mainWindowID)
        dismissWindow(id: "welcome")
    }

    init() {
        #if EVAL_VERSION
        // Recorded before the expiry is read below.
        if EvaluationManager.firstLaunchDate == nil {
            EvaluationManager.recordFirstLaunch(Date())
        }
        #endif
        _expirationDate = State(initialValue: BuildVariant.expiryDate())
        _isExpired = State(initialValue: BuildVariant.isExpired())
    }
    
}

#Preview {
    WelcomeView()
        .environment(EditLog())
}
