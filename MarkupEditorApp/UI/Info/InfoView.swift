//
//  InfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI
import MarkupEditor

struct InfoView: View {
    
    @Binding var url: URL?
    @Binding var metadataInfo: [MetadataTuple]
    @State private var infoType: InfoType
    
    let height = ToolbarConfig.fromDefaults().toolbarHeight() - 1
    
    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $infoType) {
                ForEach(InfoType.allCases) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .frame(minWidth: 0, maxHeight: CGFloat(height))
            .offset(x: -4, y: 0)    // Perfectly centered as SplitView drags
            .pickerStyle(.segmented)
            
            Divider()
            
            switch infoType {
            case .log:
                LogInfoView()
            case .document:
                DocumentInfoView(url: $url)
            case .metadata:
                MetadataInfoView(metadataInfo: $metadataInfo)
            }
            
            Spacer()
        }
        .clipped()  // Just clip all to avoid layout weirdness w/ very narrow SplitView
        .onChange(of: infoType) {
            UserDefaults.standard.set(infoType.rawValue, forKey: "infoType")
        }
    }
    
    init(url: Binding<URL?>? = nil, metadataInfo: Binding<[MetadataTuple]>? = nil) {
        _url = url ?? .constant(nil)
        _metadataInfo = metadataInfo ?? .constant([])
        let stored = UserDefaults.standard.string(forKey: "infoType") ?? InfoType.document.rawValue
        _infoType = State(initialValue: InfoType(rawValue: stored) ?? .document)
    }
}

#Preview {
    InfoView()
}
