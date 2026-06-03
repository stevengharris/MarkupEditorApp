//
//  LogInfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI

struct LogInfoView: View {
    
    @Environment(ImportLog.self) private var importLog
    
    var body: some View {
        Spacer()
        if importLog.entries.isEmpty { Text("Log is empty.") }
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(importLog.entries.indices, id: \.self) { index in
                    Text(importLog.entries[index])
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)
                }
            }
        }
    }
}

#Preview {
    LogInfoView()
}
