//
//  TourPageView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/21/26.
//

import SwiftUI

struct TourPageView: View {
    let tourPage: TourPage
    @Binding var selectedBlurb: Int
    
    var body: some View {
        let blurb = tourPage.blurbs[selectedBlurb]
        //HStack(spacing: 0) {
            //HStack {
            //    Text(blurb.key)
            //        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            //    Spacer()
            //}
            //.containerRelativeFrame(.horizontal) { width, _ in width * 0.25 }
            //.padding(4)
            HStack {
                ZStack {
                    Color.pink
                    Text(blurb.value)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }
                Spacer()
            }
            .containerRelativeFrame(.horizontal) { width, _ in width * 0.72 }
            .padding(4)
        //}
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(4)
        Text(tourPage.title).font(.largeTitle).bold()
        Text(blurb.key).multilineTextAlignment(.center).foregroundColor(.secondary)
        Spacer()
    }
}

/*
 struct TourPageView: View {
     let tourPage: TourPage
     @State private var showingPage = 0
     
     var body: some View {
         GeometryReader { listGeometry in
             let listHeight = listGeometry.size.height - 40
             List(tourPage.blurbs, id: \.key) { blurb in
                 HStack(spacing: 0) {
                     HStack {
                         Text(blurb.key)
                             .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                         Spacer()
                     }
                     .containerRelativeFrame(.horizontal) { width, _ in width * 0.25 }
                     //.border(Color.green)
                     .padding(4)
                     HStack {
                         ZStack {
                             Color.pink
                             Text(blurb.value)
                                 .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                         }
                         Spacer()
                     }
                     .containerRelativeFrame(.horizontal) { width, _ in width * 0.72 }
                     //.border(Color.green)
                     .padding(4)
                 }
                 .frame(height: listHeight / CGFloat(tourPage.blurbs.count))
                 .listRowSeparator(.hidden)
                 .frame(maxWidth: .infinity, maxHeight: .infinity)
                 //.border(Color.red, width: 1)
             }
             .listStyle(.plain)
             .scrollDisabled(true)
             .frame(maxWidth: .infinity, maxHeight: .infinity)
             .padding(4)
         }
         Text(tourPage.title).font(.largeTitle).bold()
         Text(tourPage.description).multilineTextAlignment(.center).foregroundColor(.secondary)
         Spacer()
     }
 }
 */

#Preview {
    @Previewable @State var blurbs: KeyValuePairs<String, String> = [
        "Use the shortcuts you're used to.": "Placeholder",
        "Use the built-in toolbar, customize it, or hide it.": "Placeholder",
        "Insert, edit, and navigate tables naturally.": "Placeholder",
        "Insert and resize images.": "Placeholder"
    ]
    @Previewable @State var selectedBlurb: Int = 0
    TourPageView(tourPage: TourPage(title: "Title", blurbs: blurbs), selectedBlurb: $selectedBlurb)
}
