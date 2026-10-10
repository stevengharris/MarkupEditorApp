// swift-tools-version:6.1
import PackageDescription

let package = Package(
    name: "MarkupEditorAppLib",
    platforms: [
        .macOS("26.3")
    ],
    products: [
        .library(
            name: "MarkupEditorAppLib",
            targets: ["MarkupEditorAppLib"]),
        .library(
            name: "MarkupEditorMCP",
            targets: ["MarkupEditorMCP"]),
    ],
    dependencies: [
        .package(url: "https://github.com/stevengharris/MarkupEditor.git", branch: "main"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", from: "0.12.1"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.5.0"),
    ],
    targets: [
        .target(
            name: "MarkupEditorAppLib",
            dependencies: [
                .product(name: "MarkupEditor", package: "MarkupEditor"),
            ]),
        .target(
            name: "MarkupEditorMCP",
            dependencies: [
                "MarkupEditorAppLib",
                .product(name: "MCP", package: "swift-sdk"),
                .product(name: "Logging", package: "swift-log"),
            ]),
        .testTarget(
            name: "MarkupEditorAppLibTests",
            dependencies: [
                "MarkupEditorAppLib",
                .product(name: "MarkupEditor", package: "MarkupEditor"),
            ]),
        .testTarget(
            name: "MarkupEditorMCPTests",
            dependencies: [
                "MarkupEditorMCP",
                "MarkupEditorAppLib",
            ]),
    ],
    swiftLanguageModes: [.v6]
)
