//
//  ToolbarSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

enum Field { case p, h1, h2, h3, h4, h5, h6, code }

struct ToolbarSettingsView: View {
    @AppStorage(AppConfig.ConfigKey.toolbar) private var toolbarConfigJSON: String = ""
    @State private var config = ToolbarConfig.fromDefaults()
    @State private var loaded = false
    @State private var bars: [String] = []
    @FocusState private var focusedField: Field?
    
    var body: some View {
        let toggles: [String : Toggle<Text>] = [
            "correctionBar": Toggle("Correction Bar", isOn: visibility("correctionBar")),
            "insertBar": Toggle("Insert Bar", isOn: visibility("insertBar")),
            "styleMenu": Toggle("Style Menu", isOn: visibility("styleMenu")),
            "styleBar": Toggle("Style Bar", isOn: visibility("styleBar")),
            "formatBar": Toggle("Format Bar", isOn: visibility("formatBar")),
            "search": Toggle("Search", isOn: visibility("search"))
        ]
        
        Spacer()
        Form {
            LabeledContent("Visibility and Ordering:") { Text("Drag to reorder").font(.subheadline) }.zIndex(1)
            LabeledContent("") {
                List {
                    ForEach(bars, id: \.self) { bar in
                        HStack {
                            toggles[bar]
                            Spacer()
                            Image(systemName: "arrow.up.and.down.text.horizontal")
                        }
                        .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
                        .background(Color.gray.opacity(0.05))
                    }
                    .onMove(perform: reorder)
                }
                .scrollDisabled(true)
                .zIndex(0)
                .frame(minWidth: 180, minHeight: 150)   // Needed for visibility on MacOS
                .offset(x: -16, y: -24)                 // Align with content
                .fixedSize()                            // Limit width
            }
            
            //Spacer(minLength: 16)
            
            LabeledContent("Insert:") { Toggle("Link", isOn: insertBar("link")) }
            Toggle("Image", isOn: insertBar("image"))
            Toggle("Table", isOn: insertBar("tableMenu"))
            Toggle("Header", isOn: menus("tableHeader")).padding(.leading)
            Toggle("Border", isOn: menus("tableBorder")).padding(.leading)
            
            Spacer(minLength: 16)
            
            LabeledContent("Style:") { Toggle("Show name", isOn: menus("styleName")) }
            Toggle("Lists", isOn: styleBar("list"))
            Toggle("Indent/Outdent", isOn: styleBar("dent"))
            // Under the covers, SwiftUI is positioning the trailing edge of the Label at
            // the weighted center, and taking the Label's frame width from the TextField's
            // frame width.
            TextField(text: styleName("p")) { Text("P:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .p)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h1")) { Text("H1:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h1)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h2")) { Text("H2:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h2)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h3")) { Text("H3:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h3)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h4")) { Text("H4:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h4)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h5")) { Text("H5:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h5)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("h6")) { Text("H6:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .h6)
                .frame(width: 160)
                .onSubmit { save() }
            TextField(text: styleName("pre")) { Text("Code:").frame(width: 40, alignment: .trailing) }
                .focused($focusedField, equals: .code)
                .frame(width: 160)
                .onSubmit { save() }
            Spacer(minLength: 16)
            LabeledContent("Format:") { Toggle("Bold", isOn: formatBar("bold")) }
            Toggle("Italic", isOn: formatBar("italic"))
            Toggle("Underline", isOn: formatBar("underline"))
            Toggle("Code", isOn: formatBar("code"))
            Toggle("Strikethrough", isOn: formatBar("strikethrough"))
            Toggle("Subscript", isOn: formatBar("subscript"))
            Toggle("Superscript", isOn: formatBar("superscript"))
        }
        Spacer()
        .onAppear {
            guard !loaded else { return }
            Task { focusedField = nil }
            loaded = true
            config = ToolbarConfig.fromDefaults()
            bars = config.barsInOrder()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)   // Fill parent
        .formStyle(.columns)
    }
    
    private func save() {
        if let json = config.asJSON(), toolbarConfigJSON != json {
            toolbarConfigJSON = json
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
    }
    
    private func visibility(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.visibility[key] ?? false },
            set: { config.visibility[key] = $0; save() }
        )
    }
    
    func reorder(from source: IndexSet, to destination: Int) {
        bars.move(fromOffsets: source, toOffset: destination)
        for index in bars.indices {
            config.ordering[bars[index]] = index * 10   // Consistent with original
        }
        save()
    }
    
    private func ordering(_ key: String) -> Binding<Int> {
        Binding(
            get: { config.ordering[key] ?? 0 },
            set: { config.ordering[key] = $0 })
    }
    
    private func styleName(_ key: String) -> Binding<String> {
        Binding(
            get: { (config.styleMenu[key] ?? "" ) ?? ""},
            set: { config.styleMenu[key] = $0 })
    }

    private func insertBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.insertBar[key] ?? false },
            set: { config.insertBar[key] = $0; save() }
        )
    }

    private func formatBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.formatBar[key] ?? false },
            set: { config.formatBar[key] = $0; save() }
        )
    }

    private func styleBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.styleBar[key] ?? false },
            set: { config.styleBar[key] = $0; save() }
        )
    }

    private func menus(_ key: String) -> Binding<Bool> {
        Binding(
            get: { config.menus[key] ?? false },
            set: { config.menus[key] = $0; save() }
        )
    }
}

#Preview {
    ToolbarSettingsView()
}
