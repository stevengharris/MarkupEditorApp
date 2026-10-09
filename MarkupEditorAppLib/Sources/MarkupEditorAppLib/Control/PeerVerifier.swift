//
//  PeerVerifier.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin
import Security

/// Decides whether the process on the other end of an accepted socket may talk to the app.
public protocol PeerVerifying: Sendable {
    func verify(descriptor: Int32) -> Bool
}

#if DEBUG
/// Tests: accepts every peer.
struct AcceptAnyPeer: PeerVerifying {
    func verify(descriptor: Int32) -> Bool { true }
}
#endif

/// Accepts a peer only when its code signature satisfies a requirement. The check uses the
/// audit token the kernel attaches to the connection, so it cannot be spoofed by the peer.
/// The peer's executable must be readable by this process; one that is not fails the check.
public struct CodeSignaturePeerVerifier: PeerVerifying {

    private let requirement: String

    public init(requirement: String) {
        self.requirement = requirement
    }

    public func verify(descriptor: Int32) -> Bool {
        var token = audit_token_t()
        var length = socklen_t(MemoryLayout<audit_token_t>.size)
        // SOL_LOCAL is 0 and LOCAL_PEERTOKEN is 6 in <sys/un.h>.
        guard getsockopt(descriptor, 0, 6, &token, &length) == 0 else { return false }
        let attributes = [kSecGuestAttributeAudit: Data(bytes: &token, count: MemoryLayout<audit_token_t>.size)] as CFDictionary
        var code: SecCode?
        guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess, let code else { return false }
        var parsed: SecRequirement?
        guard SecRequirementCreateWithString(requirement as CFString, [], &parsed) == errSecSuccess, let parsed else { return false }
        return SecCodeCheckValidity(code, [], parsed) == errSecSuccess
    }

    /// The designated requirement of the signed code at `url`: what any binary signed the same way
    /// satisfies. A running app uses it on its embedded command line tool, which makes the
    /// check follow whatever identity signed the build, Developer ID or a development certificate.
    public static func designatedRequirement(ofCodeAt url: URL) -> String? {
        var staticCode: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url as CFURL, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var requirement: SecRequirement?
        guard SecCodeCopyDesignatedRequirement(staticCode, [], &requirement) == errSecSuccess, let requirement else { return nil }
        var text: CFString?
        guard SecRequirementCopyString(requirement, [], &text) == errSecSuccess else { return nil }
        return text as String?
    }
}
