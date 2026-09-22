// swift-tools-version:6.1
import PackageDescription

let package = Package(
    name: "MarkupEditorAppLib",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "MarkupEditorAppLib",
            targets: ["MarkupEditorAppLib"]),
    ],
    dependencies: [
        .package(url: "https://github.com/stevengharris/MarkupEditor.git", branch: "main"),
    ],
    targets: [
        .target(
            name: "MarkupEditorAppLib",
            dependencies: [
                .product(name: "MarkupEditor", package: "MarkupEditor"),
            ]),
        .testTarget(
            name: "MarkupEditorAppLibTests",
            dependencies: [
                "MarkupEditorAppLib",
                .product(name: "MarkupEditor", package: "MarkupEditor"),
            ]),
    ],
    swiftLanguageModes: [.v6]
)
