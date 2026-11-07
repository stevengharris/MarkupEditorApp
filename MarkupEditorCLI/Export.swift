//
//  Export.swift
//  MarkupEditorApp
//

import Foundation
import ArgumentParser
import MarkupEditorAppLib

/// `markup export`: convert a Markdown file to HTML or PDF without opening the app's UI. The app's
/// executable does the conversion in a headless launch, fed through pipes, so the app need not be
/// running. The app reports which local images the document uses; this command embeds them, using the
/// same `ImageEmbedder` as the app's HTML export.
struct Export: AsyncParsableCommand {

    static let configuration = CommandConfiguration(
        commandName: "export",
        abstract: "Convert a Markdown file to HTML or PDF.",
        discussion: """
            HTML is the document body, with the front matter removed and list items written tight. \
            Local images stay relative references by default (--images link); --images embed inlines those \
            in the input file's folder. With no --output, the result goes next to the input with \
            the extension of the format; use --output - for standard output. An existing output file \
            is not overwritten unless --force is given.
            """)

    enum Format: String, ExpressibleByArgument, CaseIterable {
        case html
        case pdf
    }

    @Option(name: [.short, .long], help: "The output format: html or pdf.")
    var format: Format

    enum Images: String, ExpressibleByArgument, CaseIterable {
        case link
        case embed
    }

    @Option(name: .long, help: "For HTML: leave local images as relative references (link) or embed them as data URIs (embed). A PDF always has them embedded.")
    var images: Images = .link

    @Option(name: [.short, .long], help: "Where to write the result. Use - for standard output.")
    var output: String?

    @Flag(name: .long, help: "Overwrite the output file if it exists.")
    var force = false

    @Option(name: .long, help: "Path of the MarkupEditor app to convert with. Defaults to the app this CLI is part of.")
    var app: String?

    @Argument(help: "The Markdown file to convert.")
    var filename: String

    func run() async throws {
        guard let input = FileManager.default.contents(atPath: filename) else {
            throw ValidationError("Cannot read \(filename)")
        }
        let destination = output == "-" ? nil : (output.map { URL(fileURLWithPath: $0) }
            ?? URL(fileURLWithPath: filename).deletingPathExtension().appendingPathExtension(format.rawValue))
        if let destination {
            let input = URL(fileURLWithPath: filename).resolvingSymlinksInPath().standardizedFileURL
            if destination.resolvingSymlinksInPath().standardizedFileURL == input {
                throw ValidationError("The output would overwrite the input file \(filename)")
            }
            if !force, FileManager.default.fileExists(atPath: destination.path) {
                throw ValidationError("\(destination.path) already exists; use --force to overwrite it")
            }
        }
        guard let executable = try executableURL() else {
            throw ValidationError("MarkupEditor is not installed")
        }
        let converted = try convert(input, as: "html", with: executable)
        struct Reply: Decodable { let html: String; let srcs: [String] }
        let reply = try JSONDecoder().decode(Reply.self, from: converted)
        let folder = URL(fileURLWithPath: filename).deletingLastPathComponent()
        let embed = format == .pdf || images == .embed
        var html = reply.html
        if embed {
            let embedded = ImageEmbedder.embed(reply.srcs, in: reply.html, baseURL: folder)
            html = embedded.html
            for src in embedded.skipped {
                FileHandle.standardError.write(Data("Warning: \(src) was not embedded; it is missing, not an image, or outside \(folder.path)\n".utf8))
            }
        }
        let result: Data
        switch format {
        case .html: result = Data(html.utf8)
        case .pdf: result = try convert(Data(html.utf8), as: "pdf", with: executable)
        }
        if let destination {
            try result.write(to: destination)
        } else {
            try FileHandle.standardOutput.write(contentsOf: result)
        }
    }

    private static let timeout: TimeInterval = 120

    private func executableURL() throws -> URL? {
        let appURL: URL?
        if let app {
            appURL = URL(fileURLWithPath: app)
        } else {
            appURL = MarkupEditorCLI.appURL()
            if let appURL, let mismatch = MarkupEditorCLI.versionMismatch(of: appURL) {
                throw ValidationError(mismatch)
            }
        }
        return appURL.flatMap { Bundle(url: $0)?.executableURL }
    }

    /// Runs `executable` in headless export mode for `kind` with `input` on its standard input and returns what it writes to standard output.
    private func convert(_ input: Data, as kind: String, with executable: URL) throws -> Data {
        let process = Process()
        process.executableURL = executable
        process.arguments = ["--headless-export", kind]
        let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = stderr
        signal(SIGPIPE, SIG_IGN)
        try process.run()
        // A conversion that never completes (the app failing to load its editor) is stopped.
        nonisolated(unsafe) var timedOut = false
        let watchdog = DispatchWorkItem { timedOut = true; process.terminate() }
        DispatchQueue.global().asyncAfter(deadline: .now() + Self.timeout, execute: watchdog)
        defer { watchdog.cancel() }
        // Output and errors are read concurrently so a full pipe cannot stall the child.
        nonisolated(unsafe) var result = Data()
        nonisolated(unsafe) var errors = Data()
        let group = DispatchGroup()
        for (pipe, isOutput) in [(stdout, true), (stderr, false)] {
            group.enter()
            DispatchQueue.global().async {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                if isOutput { result = data } else { errors = data }
                group.leave()
            }
        }
        try stdin.fileHandleForWriting.write(contentsOf: input)
        try stdin.fileHandleForWriting.close()
        group.wait()
        process.waitUntilExit()
        let messages = String(decoding: errors, as: UTF8.self)
        if !messages.isEmpty { FileHandle.standardError.write(Data(messages.utf8)) }
        if timedOut { throw ValidationError("The conversion did not finish within \(Int(Self.timeout)) seconds") }
        guard process.terminationStatus == 0 else {
            throw ExitCode(process.terminationStatus)
        }
        return result
    }
}
