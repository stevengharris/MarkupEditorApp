//
//  InfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI
import MarkupEditor

enum InfoType: String, CaseIterable, Identifiable {
    case log = "Log"
    case document = "Document"
    case metadata = "Metadata"
    var id: Self { self }
}

struct InfoView: View {

    @Binding var logInfo: String
    @Binding var documentInfo: String
    @Binding var metadataInfo: [String: String]
    @State var infoType: InfoType

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
            .frame(width: .infinity, height: CGFloat(height), alignment: .center)
            .pickerStyle(.segmented)
            
            Divider()

            switch infoType {
            case .log:
                LogInfoView()
            case .document:
                DocumentInfoView()
            case .metadata:
                MetadataInfoView()
            }

            Spacer()
        }
        .onChange(of: infoType) {
            UserDefaults.standard.set(infoType.rawValue, forKey: "infoType")
        }
    }
    
    init(logInfo: Binding<String>? = nil, documentInfo: Binding<String>? = nil, metadataInfo: Binding<[String : String]>? = nil) {
        _logInfo = logInfo ?? .constant("")
        _documentInfo = documentInfo ?? .constant("")
        _metadataInfo = metadataInfo ?? .constant([:])
        _infoType = State(initialValue: InfoType(rawValue: (UserDefaults.standard.string(forKey: "infoType") ?? InfoType.document.rawValue))!)
    }
}

#Preview {
    InfoView()
}
