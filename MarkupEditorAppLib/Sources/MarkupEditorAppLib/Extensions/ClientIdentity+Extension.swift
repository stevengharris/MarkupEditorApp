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
            return identity(ofExecutable: executable, arguments: isInterpreter(executable) ? processArguments(of: pid) ?? [] : [], team: team)
        }
        let bundle = Bundle(path: appPath)
        let info = bundle?.infoDictionary
        let name = (info?["CFBundleDisplayName"] as? String)
            ?? (info?["CFBundleName"] as? String)
            ?? URL(fileURLWithPath: appPath).deletingPathExtension().lastPathComponent
        let identifier = bundle?.bundleIdentifier.flatMap { $0.isEmpty ? nil : $0 }
        return ClientIdentity(name: name, path: appPath, bundleIdentifier: identifier, teamIdentifier: team)
    }

    /// A program that is not in an app bundle: its executable and, for an interpreter, the script in `arguments`.
    static func identity(ofExecutable executable: String, arguments: [String], team: String?) -> ClientIdentity {
        let script = isInterpreter(executable) ? scriptArgument(in: arguments, interpreter: executable) : nil
        return ClientIdentity(name: displayName(forExecutable: executable, script: script), path: executable, teamIdentifier: team, script: script)
    }

    /// What to call a program that is not in an app bundle: its executable's name, except that a version
    /// number alone, as in `.../claude/versions/2.1.310`, is shown with the name of the directory it is
    /// installed under, as in "Claude 2.1.310".
    static func displayName(forExecutable path: String, script: String? = nil) -> String {
        let url = URL(fileURLWithPath: path)
        let name = url.lastPathComponent
        if let script { return "\(programName(ofScript: script)) (\(name))" }
        guard name.first?.isNumber == true, name.allSatisfy({ $0.isNumber || $0 == "." }) else { return name }
        var directory = url.deletingLastPathComponent()
        if directory.lastPathComponent == "versions" { directory = directory.deletingLastPathComponent() }
        let program = directory.lastPathComponent
        guard !program.isEmpty, program != "/" else { return name }
        return "\(program.prefix(1).uppercased())\(program.dropFirst()) \(name)"
    }

    private static let interpreters: Set<String> = ["node", "nodejs", "bun", "deno", "ruby", "perl", "php", "sh", "bash", "zsh", "dash", "fish"]

    /// Whether the executable runs scripts, so what it runs says more about the program than it does.
    static func isInterpreter(_ executable: String) -> Bool {
        let name = URL(fileURLWithPath: executable).lastPathComponent
        return interpreters.contains(name) || name.hasPrefix("python")
    }

    /// The script an interpreter was started with: the first argument after the interpreter that is not an
    /// option, without the options' values. Nil when it runs inline code (`-e`, `-c`), a REPL, or standard
    /// input. A script given as a link is resolved to the file it names.
    static func scriptArgument(in arguments: [String], interpreter: String) -> String? {
        let valued: Set<String> = ["-r", "--require", "--import", "--loader", "--experimental-loader", "--eval", "-e", "-p", "--print", "-c", "-m", "-I", "-W", "-X"]
        let inline: Set<String> = ["-e", "-p", "--eval", "--print", "-c"]
        var index = 1
        while index < arguments.count {
            let argument = arguments[index]
            if inline.contains(argument) { return nil }
            if argument == "-m", index + 1 < arguments.count { return arguments[index + 1] }
            if valued.contains(argument) { index += 2; continue }
            if argument.hasPrefix("-") { index += 1; continue }
            let url = URL(fileURLWithPath: argument)
            return argument.hasPrefix("/") ? url.resolvingSymlinksInPath().path : argument
        }
        return nil
    }

    /// What to call the program a script belongs to: the package name for a script inside `node_modules`,
    /// otherwise the script's file name without its extension.
    static func programName(ofScript script: String) -> String {
        let components = script.split(separator: "/").map(String.init)
        if let modules = components.lastIndex(of: "node_modules"), modules + 1 < components.count {
            return components[modules + 1].hasPrefix("@") && modules + 2 < components.count ? components[modules + 2] : components[modules + 1]
        }
        let name = components.last ?? script
        return URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent
    }

    /// The arguments process `pid` was started with, from the kernel's process argument block.
    static func processArguments(of pid: pid_t) -> [String]? {
        var mib = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, UInt32(mib.count), nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return nil }
        var buffer = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, UInt32(mib.count), &buffer, &size, nil, 0) == 0 else { return nil }
        return parseProcessArguments(Array(buffer.prefix(size)))
    }

    /// Splits a KERN_PROCARGS2 block: an argument count, the executable path, padding, then that many arguments.
    static func parseProcessArguments(_ bytes: [UInt8]) -> [String]? {
        guard bytes.count > MemoryLayout<Int32>.size else { return nil }
        let count = Int(bytes.withUnsafeBytes { $0.loadUnaligned(as: Int32.self) })
        var index = MemoryLayout<Int32>.size
        while index < bytes.count, bytes[index] != 0 { index += 1 }      // executable path
        while index < bytes.count, bytes[index] == 0 { index += 1 }      // padding
        var arguments: [String] = []
        while arguments.count < count, index < bytes.count {
            var end = index
            while end < bytes.count, bytes[end] != 0 { end += 1 }
            arguments.append(String(decoding: bytes[index..<end], as: UTF8.self))
            index = end + 1
        }
        return arguments.count == count ? arguments : nil
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
        return String(decoding: buffer.prefix(Int(length)).map { UInt8(bitPattern: $0) }, as: UTF8.self)
    }
}
