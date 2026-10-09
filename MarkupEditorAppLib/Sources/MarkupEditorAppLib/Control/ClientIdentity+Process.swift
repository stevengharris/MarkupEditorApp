//
//  ClientIdentity+Process.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin

extension ClientIdentity {

    /// The program that started this process, such as an MCP client launching `markup mcp`.
    public static func ofParentProcess() -> ClientIdentity? {
        describe(pid: getppid())
    }

    /// Describes the process `pid`. A process inside an app bundle is reported as that app, so a
    /// helper process is recognized as its app; anything else is reported by its executable.
    public static func describe(pid: pid_t) -> ClientIdentity? {
        guard let executable = executablePath(of: pid) else { return nil }
        guard let appPath = outermostAppBundle(containing: executable) else {
            return ClientIdentity(name: URL(fileURLWithPath: executable).lastPathComponent, path: executable)
        }
        let bundle = Bundle(path: appPath)
        let info = bundle?.infoDictionary
        let name = (info?["CFBundleDisplayName"] as? String)
            ?? (info?["CFBundleName"] as? String)
            ?? URL(fileURLWithPath: appPath).deletingPathExtension().lastPathComponent
        return ClientIdentity(name: name, path: appPath, bundleIdentifier: bundle?.bundleIdentifier)
    }

    /// The outermost `.app` directory in `path`, or nil when the path is not inside an app bundle.
    static func outermostAppBundle(containing path: String) -> String? {
        var built = ""
        for component in path.split(separator: "/", omittingEmptySubsequences: true) {
            built += "/" + component
            if component.hasSuffix(".app") { return built }
        }
        return nil
    }

    private static func executablePath(of pid: pid_t) -> String? {
        var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        return String(cString: buffer)
    }
}
