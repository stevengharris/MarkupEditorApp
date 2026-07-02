//
//  LogInfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI

struct LogInfoView: View {
    
    @Environment(EditLog.self) private var editLog
    
    var body: some View {
        Spacer()
        if editLog.entries.isEmpty { Text("Log is empty.") }
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(editLog.entries.indices, id: \.self) { index in
                    Text(editLog.entries[index])
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)
                        .textSelection(.enabled)
                }
            }
        }
    }
}

#Preview {
    LogInfoView()
}
