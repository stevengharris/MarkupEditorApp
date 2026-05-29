//
//  InfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI
import MarkupEditor

struct InfoView: View {

    @Binding var logInfo: String
    @Binding var documentInfo: String
    @Binding var metadataInfo: [(key: String, value: MetadataValue)]
    @State private var infoType: InfoType

    let height = ToolbarConfig.fromDefaults().toolbarHeight()
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Picker("", selection: $infoType) {
                    ForEach(InfoType.allCases) { info in
                        Text(info.rawValue).tag(info)
                    }
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: CGFloat(height))
            .pickerStyle(.segmented)
            
            Divider()

            switch infoType {
            case .log:
                LogInfoView()
            case .document:
                DocumentInfoView()
            case .metadata:
                MetadataInfoView()  // TODO: forward metadataInfo once MetadataInfoView supports editing (deferred)
            }

            Spacer()
        }
        .onChange(of: infoType) {
            UserDefaults.standard.set(infoType.rawValue, forKey: "infoType")
        }
    }
    
    init(logInfo: Binding<String>? = nil, documentInfo: Binding<String>? = nil, metadataInfo: Binding<[(key: String, value: MetadataValue)]>? = nil) {
        _logInfo = logInfo ?? .constant("")
        _documentInfo = documentInfo ?? .constant("")
        _metadataInfo = metadataInfo ?? .constant([])
        let stored = UserDefaults.standard.string(forKey: "infoType") ?? InfoType.document.rawValue
        _infoType = State(initialValue: InfoType(rawValue: stored) ?? .document)
    }
}

#Preview {
    InfoView()
}
