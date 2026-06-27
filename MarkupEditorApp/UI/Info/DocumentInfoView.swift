//
//  DocumentInfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI

struct DocumentInfoView: View {
    @Binding var url: URL?
    
    var body: some View {
        Spacer()
        VStack {
            Text(url?.path() ?? "No file is open.")
            Spacer()
        }
    }
}

#Preview {
    DocumentInfoView(url: .constant(nil))
}
