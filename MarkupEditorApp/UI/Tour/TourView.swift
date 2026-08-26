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

    var body: some View {
        let lastPage = pageContents.count - 1
        let lastBlurb = pageContents[selectedPage].blurbs.count - 1
        let finalBlurb = selectedPage == lastPage && selectedBlurb == lastBlurb
        if hasSeenTour && !force {
            MarkupDocumentView()
                .environment(editLog)
        } else {
            TourPageView(tourPage: pageContents[selectedPage], selectedBlurb: $selectedBlurb)
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
