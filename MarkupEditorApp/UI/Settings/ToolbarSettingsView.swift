//
//  ToolbarSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct ToolbarSettingsView: View {
    
    enum Field { case p, h1, h2, h3, h4, h5, h6, code }

    enum SettingGroup: String, CaseIterable, Identifiable {
        case visibility = "Visibility"
        case insert = "Insert"
        case style = "Style"
        case format = "Format"
        var id: Self { self }
    }
    
    typealias ConfigKey = AppConfig.ConfigKey
    typealias ToolbarVisibility = AppConfig.ToolbarVisibility
    typealias ToggledState = AppConfig.ToggledState

    @AppStorage(ConfigKey.toolbar) private var toolbarConfigJSON: String = ""
    @State private var toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()
    @State private var toolbarVisibility: ToolbarVisibility = ToolbarVisibility(rawValue: AppConfig.shared.toolbarVisibility) ?? .toggled
    @State private var settingGroup: SettingGroup = .visibility
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
        VStack(spacing: 0) {
            Picker("", selection: $settingGroup) {
                ForEach(SettingGroup.allCases) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .pickerStyle(.segmented)

            switch settingGroup {
            case .visibility:
                Form {
                    Text("")
                    Picker("Toolbar:", selection: $toolbarVisibility) {
                        ForEach(ToolbarVisibility.allCases) { visibility in
                            Text(visibility.rawValue)
                        }
                    }
                    .pickerStyle(.radioGroup)
                    .onChange(of: toolbarVisibility) { oldValue, newValue in
                        setToolbarVisibility(newValue)
                    }
                    .padding(.bottom, 8)
                    LabeledContent("Toolbar segments:") {
                        Text("Drag to reorder")
                    }
                    List {
                        ForEach(bars, id: \.self) { bar in
                            HStack {
                                toggles[bar]
                                Spacer()
                                Image(systemName: "arrow.up.and.down.text.horizontal")
                            }
                            .listRowInsets(.init(top: 0, leading: -16, bottom: 0, trailing: 0))
                            .background(Color.gray.opacity(0.05))
                        }
                        .onMove(perform: reorder)
                    }
                    .padding(.top, -8)
                    .scrollDisabled(true)
                    .frame(minWidth: 180, minHeight: 160, alignment: .top)   // Needed for visibility on MacOS
                    .fixedSize()
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .insert:
                Form {
                    Text("")
                    Toggle("Link", isOn: insertBar("link"))
                    Toggle("Image", isOn: insertBar("image"))
                    Toggle("Table", isOn: insertBar("tableMenu"))
                    Toggle("Header", isOn: menus("tableHeader")).padding(.leading)
                    Toggle("Border", isOn: menus("tableBorder")).padding(.leading)
                    Toggle("Horizontal Rule", isOn: insertBar("hRule"))
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .style:
                Form {
                    Text("")
                    Toggle("Show name", isOn: menus("styleName"))
                    Toggle("Lists", isOn: styleBar("list"))
                    Toggle("Indent/Outdent", isOn: styleBar("dent"))
                    Spacer()
                    LabeledContent("Style name:") {
                        Text("Enter to update")
                    }
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
                    Spacer()
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .format:
                Form {
                    Text("")
                    Toggle("Bold", isOn: formatBar("bold"))
                    Toggle("Italic", isOn: formatBar("italic"))
                    Toggle("Underline", isOn: formatBar("underline"))
                    Toggle("Code", isOn: formatBar("code"))
                    Toggle("Strikethrough", isOn: formatBar("strikethrough"))
                    Toggle("Subscript", isOn: formatBar("subscript"))
                    Toggle("Superscript", isOn: formatBar("superscript"))
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .clipped()  // Just clip all to avoid layout weirdness w/ very narrow SplitView
        .onChange(of: settingGroup) {
            UserDefaults.standard.set(settingGroup.rawValue, forKey: "settingGroup")
        }
        .onAppear {
            guard !loaded else { return }
            Task { focusedField = nil }
            loaded = true
            toolbarConfig = ToolbarConfig.fromDefaults()
            bars = toolbarConfig.barsInOrder()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)   // Fill parent
        .formStyle(.columns)
    }
    
    private func save() {
        if let json = toolbarConfig.asJSON(), toolbarConfigJSON != json {
            toolbarConfigJSON = json
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
    }
    
    private func visibility(_ key: String) -> Binding<Bool> {
        Binding(
            get: { toolbarConfig.visibility[key] ?? false },
            set: { toolbarConfig.visibility[key] = $0; save() }
        )
    }
    
    func reorder(from source: IndexSet, to destination: Int) {
        bars.move(fromOffsets: source, toOffset: destination)
        for index in bars.indices {
            toolbarConfig.ordering[bars[index]] = index * 10   // Consistent with original
        }
        save()
    }
    
    private func ordering(_ key: String) -> Binding<Int> {
        Binding(
            get: { toolbarConfig.ordering[key] ?? 0 },
            set: { toolbarConfig.ordering[key] = $0 })
    }
    
    private func styleName(_ key: String) -> Binding<String> {
        Binding(
            get: { (toolbarConfig.styleMenu[key] ?? "" ) ?? ""},
            set: { toolbarConfig.styleMenu[key] = $0 })
    }
    
    private func insertBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { toolbarConfig.insertBar[key] ?? false },
            set: { toolbarConfig.insertBar[key] = $0; save() }
        )
    }
    
    private func formatBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { toolbarConfig.formatBar[key] ?? false },
            set: { toolbarConfig.formatBar[key] = $0; save() }
        )
    }
    
    private func styleBar(_ key: String) -> Binding<Bool> {
        Binding(
            get: { toolbarConfig.styleBar[key] ?? false },
            set: { toolbarConfig.styleBar[key] = $0; save() }
        )
    }
    
    private func menus(_ key: String) -> Binding<Bool> {
        Binding(
            get: { toolbarConfig.menus[key] ?? false },
            set: { toolbarConfig.menus[key] = $0; save() }
        )
    }
    
    /// Set the toolbarVisibility to the new value, keeping the config in proper sync and saving when done.
    /// By "proper sync", we mean that we have to track AppConfig's toggledState to match the end state of whether
    /// the toolbar will be visible or not. And, the toolbarConfig.visibility has to be set properly because when we
    /// open a new MarkupEditorApp, the initial toolbar has to be set up properly to avoid a redraw.
    private func setToolbarVisibility(_ value: ToolbarVisibility) {
        AppConfig.update { config in
            config.toolbarVisibility = value.rawValue
            if value == .hidden {           // When always hidden, toolbarConfig.visibility muse be false
                toolbarConfig.visibility["toolbar"] = false
                config.toggledState = ToggledState.hidden.rawValue
            } else if value == .visible {   // When always visible, toolbarConfig.visibility must be true
                toolbarConfig.visibility["toolbar"] = true
                config.toggledState = ToggledState.visible.rawValue
            } else {                        // When toggled, toolbarConfig.visibility depends on the current state
                toolbarConfig.visibility["toolbar"] = !config.isHidden()
            }
            saveToolbarConfig()
        }
    }
    
    private func saveToolbarConfig() {
        if let json = toolbarConfig.asJSON(), toolbarConfigJSON != json {
            toolbarConfigJSON = json
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
    }
    
}

#Preview {
    ToolbarSettingsView()
}
