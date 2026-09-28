//
//  MemberClient.swift
//  MarkupEditorAppLib
//

import Foundation

/// Opaque handle Ghost returns when it emails a one-time sign-in code.
public struct OTCRef: Equatable, Sendable {
    public let value: String

    public init(_ value: String) {
        self.value = value
    }
}

/// A signed-in markupeditor.app member.
public struct Member: Equatable, Sendable, Decodable {

    public enum Status: String, Equatable, Sendable, Decodable {
        case paid
        case comped
        /// A redeemed gift subscription.
        case gift
        case free
    }

    public let email: String
    public let status: Status

    public init(email: String, status: Status) {
        self.email = email
        self.status = status
    }

    /// Comped and gift members get everything paid members get.
    public var isPaid: Bool {
        switch status {
        case .paid, .comped, .gift: true
        case .free: false
        }
    }
}

public enum MemberError: Error, Equatable, Sendable {
    /// Wrong or expired code. Ghost answers an email with no member the same way.
    case invalidCode
    case transportFailure(String)
    case unexpectedStatus(Int)
    case undecodableResponse(String)
}

extension MemberError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .invalidCode:
            return "That code didn't work. Check the email address, or create an account at markupeditor.app."
        case .transportFailure(let reason):
            return "Could not reach markupeditor.app: \(reason)"
        case .unexpectedStatus(let code):
            return "markupeditor.app request failed with status \(code)."
        case .undecodableResponse(let reason):
            return "markupeditor.app response could not be understood: \(reason)"
        }
    }
}

/// Signs a member in to a Ghost site with an emailed one-time code and reads their
/// membership status. The session lives in the URLSession's cookie storage.
public struct MemberClient: Sendable {

    public static let defaultBaseURL = URL(string: "https://www.markupeditor.app")!

    public let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL = MemberClient.defaultBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /// Asks Ghost to email a sign-in code. Ghost returns a reference whether or not
    /// the email belongs to a member, so an unknown email only fails at `verify`.
    public func requestCode(email: String) async throws(MemberError) -> OTCRef {
        let token = try await integrityToken()
        let body: [String: Any] = ["email": email, "emailType": "signin", "includeOTC": true, "integrityToken": token]
        let (data, status) = try await send("POST", "members/api/send-magic-link/", json: body)
        guard (200...299).contains(status) else { throw .unexpectedStatus(status) }
        guard let ref = try Self.object(data)["otc_ref"] as? String else {
            throw .undecodableResponse("missing otc_ref")
        }
        return OTCRef(ref)
    }

    /// Exchanges the emailed code for a session cookie.
    public func verify(code: String, ref: OTCRef) async throws(MemberError) {
        let token = try await integrityToken()
        let body: [String: Any] = ["otc": code, "otcRef": ref.value, "integrityToken": token]
        let (data, status) = try await send("POST", "members/api/verify-otc", json: body)
        if status == 400 { throw .invalidCode }
        guard (200...299).contains(status) else { throw .unexpectedStatus(status) }
        guard let redirect = try Self.object(data)["redirectUrl"] as? String,
              let url = URL(string: redirect) else {
            throw .undecodableResponse("missing redirectUrl")
        }
        // The sign-in URL carries a session token; never send it anywhere but the site.
        guard url.host == baseURL.host, url.scheme == baseURL.scheme, url.port == baseURL.port else {
            throw .undecodableResponse("redirectUrl is not on \(baseURL.host ?? "the site")")
        }
        let (_, signInStatus) = try await send("GET", url)
        guard (200...399).contains(signInStatus) else { throw .unexpectedStatus(signInStatus) }
    }

    /// The signed-in member, or nil when there is no valid session. Ghost answers a
    /// missing or expired session with 204 and no body, or with a JSON null.
    public func currentMember() async throws(MemberError) -> Member? {
        let (data, status) = try await send("GET", "members/api/member/")
        guard (200...299).contains(status) else { throw .unexpectedStatus(status) }
        let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text == "null" { return nil }
        do {
            return try JSONDecoder().decode(Member.self, from: data)
        } catch {
            throw .undecodableResponse(error.localizedDescription)
        }
    }

    /// Ends the session on the site and drops the site's cookies locally, even if
    /// the site can't be reached.
    public func signOut() async throws(MemberError) {
        defer { clearCookies() }
        let (_, status) = try await send("DELETE", "members/api/session")
        guard (200...299).contains(status) else { throw .unexpectedStatus(status) }
    }

    private func integrityToken() async throws(MemberError) -> String {
        let (data, status) = try await send("GET", "members/api/integrity-token/")
        guard (200...299).contains(status) else { throw .unexpectedStatus(status) }
        return String(decoding: data, as: UTF8.self)
    }

    private func clearCookies() {
        guard let storage = session.configuration.httpCookieStorage else { return }
        for cookie in storage.cookies(for: baseURL) ?? [] {
            storage.deleteCookie(cookie)
        }
    }

    private func send(_ method: String, _ path: String, json: [String: Any]? = nil) async throws(MemberError) -> (Data, Int) {
        try await send(method, baseURL.appending(path: path), json: json)
    }

    private func send(_ method: String, _ url: URL, json: [String: Any]? = nil) async throws(MemberError) -> (Data, Int) {
        // A cached member response could outlive the session it describes.
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: json)
            } catch {
                throw .undecodableResponse(error.localizedDescription)
            }
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw .transportFailure(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw .transportFailure("non-HTTP response")
        }
        return (data, http.statusCode)
    }

    private static func object(_ data: Data) throws(MemberError) -> [String: Any] {
        do {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw MemberError.undecodableResponse("expected a JSON object")
            }
            return object
        } catch let error as MemberError {
            throw error
        } catch {
            throw .undecodableResponse(error.localizedDescription)
        }
    }
}
