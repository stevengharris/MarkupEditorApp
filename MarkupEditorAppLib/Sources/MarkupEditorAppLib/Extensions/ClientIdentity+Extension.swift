//
//  ClientIdentity+Extension.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin
import Security

extension ClientIdentity {

    /// The program that started this process, such as an MCP client launching `markup mcp`.
    public static func ofParentProcess() -> ClientIdentity? {
        let parent = getppid()
        // Once the parent has exited this process belongs to launchd, which says nothing about who asked.
        guard parent > 1 else { return nil }
        return describe(pid: parent)
    }

    /// Describes the process `pid`. A process inside an app bundle is reported as that app, so a
    /// helper process is recognized as its app; anything else is reported by its executable.
    public static func describe(pid: pid_t) -> ClientIdentity? {
        guard let executable = executablePath(of: pid) else { return nil }
        let team = teamIdentifier(ofProcess: pid)
        guard let appPath = outermostAppBundle(containing: executable) else {
            return ClientIdentity(name: URL(fileURLWithPath: executable).lastPathComponent, path: executable, teamIdentifier: team)
        }
        let bundle = Bundle(path: appPath)
        let info = bundle?.infoDictionary
        let name = (info?["CFBundleDisplayName"] as? String)
            ?? (info?["CFBundleName"] as? String)
            ?? URL(fileURLWithPath: appPath).deletingPathExtension().lastPathComponent
        let identifier = bundle?.bundleIdentifier.flatMap { $0.isEmpty ? nil : $0 }
        return ClientIdentity(name: name, path: appPath, bundleIdentifier: identifier, teamIdentifier: team)
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

    /// The team that signed the running process `pid`, or nil when it is unsigned or signed without one.
    private static func teamIdentifier(ofProcess pid: pid_t) -> String? {
        var code: SecCode?
        let attributes = [kSecGuestAttributePid: Int(pid)] as CFDictionary
        guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var information: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess,
              let dictionary = information as? [String: Any] else { return nil }
        return dictionary[kSecCodeInfoTeamIdentifier as String] as? String
    }

    private static func executablePath(of pid: pid_t) -> String? {
        var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        return String(cString: buffer)
    }
}
