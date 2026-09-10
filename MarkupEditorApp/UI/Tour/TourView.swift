//
//  TourView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/21/26.
//

import SwiftUI

struct TourView: View {
    @AppStorage(MarkupEditorApp.hasSeenTourKey) private var hasSeenTour = false
    @State private var selectedPage: Int = 0
    @State private var selectedBlurb: Int = 0
    @Binding var editLog: EditLog
    public var force: Bool = false  // Mainly for previews
    #if EVAL_VERSION
    var evaluationNotice: String? = nil
    @State private var hasShownEvaluationNotice = false
    #endif

    @State private var pageContents: [TourPage] = [
        TourPage(
            title: "Markdown",
            blurbs: [
                "Read comfortably, write confidently.": "Placeholder",
                "Use the built-in toolbar, customize it, or hide it.": "Placeholder",
                "Edit the document directly or Markdown source.": "Placeholder",
            ]
        ),
        TourPage(
            title: "Tools",
            blurbs: [
                "Display Mermaid diagrams and GeoJSON out-of-the-box.": "Placeholder",
                "Export HTML, PDF, and DocX out of the box.": "Placeholder",
                "Handle Markdown front matter like HTML and YAML metadata.": "Placeholder",
            ]
        ),
        TourPage(
            title: "Flexibility",
            blurbs: [
                "Customize the editor to work the way you want.": "Placeholder",
                "Use and create templates for common Markdown documents.": "Placeholder",
                "Build from source or subscribe for ongoing packaged updates.": "Placeholder"
            ]
        )
    ]

    /// The pages actually shown this launch. When there's a pending
    /// evaluation notice, it's prepended as its own page -- the same
    /// TourPageView rendering as any other page, not a separate window or
    /// alert competing with this one. A returning user (hasSeenTour already
    /// true) sees only that one page, not the whole tour replayed.
    private var displayedPages: [TourPage] {
        #if EVAL_VERSION
        if let evaluationNotice, !hasShownEvaluationNotice {
            let noticePage = TourPage(title: "Evaluation Version", blurbs: [evaluationNotice: "Placeholder"])
            return hasSeenTour ? [noticePage] : [noticePage] + pageContents
        }
        #endif
        return pageContents
    }

    private var toursComplete: Bool {
        #if EVAL_VERSION
        hasSeenTour && (evaluationNotice == nil || hasShownEvaluationNotice)
        #else
        hasSeenTour
        #endif
    }

    var body: some View {
        if toursComplete && !force {
            MarkupDocumentView()
                .environment(editLog)
        } else {
            // displayedPages shrinks (drops the evaluation-notice page) the
            // instant hasShownEvaluationNotice flips true on the final button
            // press -- computed only in this branch, after the toursComplete
            // check above, so selectedPage is never read against the wrong
            // (shorter) array on that same transition. Reading it before the
            // check crashed with an index-out-of-range trap.
            let pages = displayedPages
            let lastPage = pages.count - 1
            let lastBlurb = pages[selectedPage].blurbs.count - 1
            let finalBlurb = selectedPage == lastPage && selectedBlurb == lastBlurb
            TourPageView(tourPage: pages[selectedPage], selectedBlurb: $selectedBlurb)
            .onAppear {
                selectedPage = 0
                selectedBlurb = 0
                AppDelegate.skipTerminateCheck = true
            }
            Button(finalBlurb ? "Get Started" : "Next") {
                if !finalBlurb {
                    if selectedBlurb < lastBlurb {
                        selectedBlurb += 1
                    } else {
                        selectedBlurb = 0
                        selectedPage += 1
                    }
                } else {
                    hasSeenTour = true
                    #if EVAL_VERSION
                    hasShownEvaluationNotice = true
                    #endif
                }
            }
            .buttonStyle(.borderedProminent)
            .padding()
        }
    }

}

#Preview {
    @Previewable @State var editLog: EditLog = EditLog()
    TourView(editLog: $editLog, force: true)
}
