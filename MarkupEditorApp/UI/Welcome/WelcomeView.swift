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
    @State private var showedThanks = false
    // Fixed when the welcome is created, so the text and Next behavior can't change mid-display.
    @State private var expirationDate: Date?
    @State private var isExpired: Bool

    var body: some View {
        VStack(spacing: 16) {
            // Both pages stay in the layout so the window is always as tall as the taller one.
            ZStack {
                ThanksView(variant: BuildVariant.current, expirationDate: expirationDate, isExpired: isExpired)
                    .opacity(showedThanks ? 0 : 1)
                    .allowsHitTesting(!showedThanks)
                    .accessibilityHidden(showedThanks)
                EditingWelcomeView()
                    .opacity(showedThanks ? 1 : 0)
                    .allowsHitTesting(showedThanks)
                    .accessibilityHidden(!showedThanks)
            }
            HStack {
                Button("Next") {
                    if isExpired {
                        AppDelegate.upgradeOnly = true
                        openWindow(id: "upgrade")
                        dismissWindow(id: "welcome")
                    } else if showedThanks {
                        hasSeenWelcome = true
                        // The document window answers the unsaved-changes check from here on.
                        AppDelegate.skipTerminateCheck = false
                        AppDelegate.pendingWelcomeDocument = true
                        openWindow(id: MarkupEditorApp.mainWindowID)
                        dismissWindow(id: "welcome")
                    } else {
                        showedThanks = true
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 460)
        .onAppear {
            // No document view exists to answer the unsaved-changes check a quit normally waits for.
            AppDelegate.skipTerminateCheck = true
        }
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
}
