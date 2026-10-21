//
//  ThanksView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 10/19/26.
//

import SwiftUI
import MarkupEditorAppLib

struct ThanksView: View {
    
    let variant: BuildVariant
    let expirationDate: Date?
    let isExpired: Bool

    private var expirationText: String {
        expirationDate?.formatted(date: .abbreviated, time: .shortened) ?? "an unknown date"
    }

    var body: some View {
        VStack(spacing: 16) {
            Image("AppLogo")
                .resizable().scaledToFit().frame(width: 60, height: 60)
            Text("Thanks for installing MarkupEditor v\(BuildVariant.version). ")
            switch variant {
            case .evaluation where isExpired:
                Text(
                    "This is an Evaluation version that expired on \(expirationText). Subscribe and download the unlimited version at https://markupeditor.app/downloads."
                )
            case .evaluation:
                Text(
                    "This is an Evaluation version that will expire on \(expirationText). To support MarkupEditor development and get automatic updates, subscribe and download the unlimited version at https://markupeditor.app/downloads."
                )
            case .unlimited:
                Text(
                    "This is an Unlimited version. Thank you for subscribing and supporting MarkupEditor development!"
                )
            case .development:
                Text(
                    "This is a Development version built from source. To support MarkupEditor development and get automatic updates, subscribe at https://markupeditor.app/downloads.")
            }
        }
        .frame(maxWidth: .infinity)
    }
    
}

#Preview("Expired evaluation") {
    ThanksView(variant: .evaluation, expirationDate: Date(), isExpired: true)
}

#Preview("Evaluation") {
    ThanksView(variant: .evaluation, expirationDate: Date().addingTimeInterval(7 * 24 * 60 * 60), isExpired: false)
}

#Preview("Unlimited") {
    ThanksView(variant: .unlimited, expirationDate: nil, isExpired: false)
}

#Preview("Development") {
    ThanksView(variant: .development, expirationDate: nil, isExpired: false)
}
