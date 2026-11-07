//
//  ImageEmbedder.swift
//  MarkupEditorAppLib
//

import Foundation
import UniformTypeIdentifiers

/// Inlines local images into exported HTML as `data:` URIs, so the result is one self-contained file.
public enum ImageEmbedder {

    /// Returns `html` with each `src="<s>"` for `s` in `srcs` replaced by a `data:` URI of the image at
    /// `s` relative to `baseURL`, read as a percent-encoded path and, failing that, as written. A source is left as written when it resolves outside `baseURL`
    /// (including through `..` or a symlink), is not an image file, or cannot be read.
    public static func embedding(_ srcs: [String], in html: String, baseURL: URL) -> String {
        embed(srcs, in: html, baseURL: baseURL).html
    }

    /// As `embedding(_:in:baseURL:)`, also returning the sources that were left as written.
    public static func embed(_ srcs: [String], in html: String, baseURL: URL) -> (html: String, skipped: [String]) {
        let root = baseURL.resolvingSymlinksInPath().standardizedFileURL.path(percentEncoded: false)
        let prefix = root.hasSuffix("/") ? root : root + "/"
        var result = html
        var skipped: [String] = []
        for src in Set(srcs).sorted() {
            let candidates = [src.removingPercentEncoding, src].compactMap { $0 }.map {
                baseURL.appendingPathComponent($0).resolvingSymlinksInPath().standardizedFileURL
            }
            guard let file = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }),
                  file.path(percentEncoded: false).hasPrefix(prefix),
                  let type = UTType(filenameExtension: file.pathExtension), type.conforms(to: .image),
                  let mime = type.preferredMIMEType,
                  let data = try? Data(contentsOf: file) else { skipped.append(src); continue }
            let dataURI = "data:\(mime);base64,\(data.base64EncodedString())"
            result = result.replacingOccurrences(of: "src=\"\(src)\"", with: "src=\"\(dataURI)\"")
        }
        return (result, skipped)
    }
}
