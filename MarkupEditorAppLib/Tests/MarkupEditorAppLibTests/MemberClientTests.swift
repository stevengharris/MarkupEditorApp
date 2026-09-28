//
//  MemberClientTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Synchronization
import Testing
@testable import MarkupEditorAppLib

/// Answers every request from a single test-supplied handler and records what was sent.
final class StubURLProtocol: URLProtocol {

    struct Reply {
        var status: Int
        var body: Data = Data()
        var headers: [String: String] = [:]
    }

    struct Recorded {
        var method: String
        var url: URL
        var body: Data?
        var cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
    }

    private static let state = Mutex<(handler: (@Sendable (URLRequest) throws -> Reply)?, requests: [Recorded])>((nil, []))

    static func reset(_ handler: @escaping @Sendable (URLRequest) throws -> Reply) {
        state.withLock { $0 = (handler, []) }
    }

    static var requests: [Recorded] { state.withLock { $0.requests } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        let body = request.httpBody ?? request.httpBodyStream.map(Self.readAll)
        let handler = Self.state.withLock { state -> (@Sendable (URLRequest) throws -> Reply)? in
            state.requests.append(Recorded(method: request.httpMethod ?? "GET", url: url, body: body, cachePolicy: request.cachePolicy))
            return state.handler
        }
        do {
            guard let handler else { throw URLError(.resourceUnavailable) }
            let reply = try handler(request)
            let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)
            if let response {
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            }
            client?.urlProtocol(self, didLoad: reply.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    private static func readAll(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

@Suite(.serialized)
struct MemberClientTests {

    static let base = URL(string: "https://example.test")!

    let cookies: HTTPCookieStorage
    let client: MemberClient

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        cookies = HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: UUID().uuidString)
        config.httpCookieStorage = cookies
        client = MemberClient(baseURL: Self.base, session: URLSession(configuration: config))
    }

    static func json(_ object: Any) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    static func bodyJSON(_ recorded: StubURLProtocol.Recorded) -> [String: Any] {
        guard let body = recorded.body,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return [:] }
        return object
    }

    /// Serves the integrity token, then defers everything else to `rest`.
    static func withIntegrityToken(_ rest: @escaping @Sendable (URLRequest) throws -> StubURLProtocol.Reply) -> @Sendable (URLRequest) throws -> StubURLProtocol.Reply {
        { request in
            if request.url?.path(percentEncoded: false) == "/members/api/integrity-token/" {
                return .init(status: 200, body: Data("token-123".utf8))
            }
            return try rest(request)
        }
    }

    // MARK: requestCode

    @Test func requestCodeSendsSigninWithOTCAndIntegrityToken() async throws {
        StubURLProtocol.reset(Self.withIntegrityToken { _ in
            .init(status: 201, body: Self.json(["otc_ref": "ref-1", "inboxLinks": ["desktop": "x"]]))
        })

        let ref = try await client.requestCode(email: "a@example.test")

        #expect(ref == OTCRef("ref-1"))
        let sent = StubURLProtocol.requests
        #expect(sent.map(\.method) == ["GET", "POST"])
        #expect(sent.map { $0.url.path(percentEncoded: false) } == ["/members/api/integrity-token/", "/members/api/send-magic-link/"])
        let body = Self.bodyJSON(sent[1])
        #expect(body["email"] as? String == "a@example.test")
        #expect(body["emailType"] as? String == "signin")
        #expect(body["includeOTC"] as? Bool == true)
        #expect(body["integrityToken"] as? String == "token-123")
    }

    @Test func requestCodeWithoutOTCRefIsUndecodable() async {
        StubURLProtocol.reset(Self.withIntegrityToken { _ in .init(status: 201, body: Self.json([:])) })

        await #expect(throws: MemberError.self) { try await client.requestCode(email: "a@example.test") }
        do {
            _ = try await client.requestCode(email: "a@example.test")
        } catch {
            guard case .undecodableResponse = error else {
                Issue.record("expected undecodableResponse, got \(error)")
                return
            }
        }
    }

    @Test func requestCodeServerErrorIsUnexpectedStatus() async {
        StubURLProtocol.reset(Self.withIntegrityToken { _ in .init(status: 429) })

        do {
            _ = try await client.requestCode(email: "a@example.test")
            Issue.record("expected an error")
        } catch {
            #expect(error == .unexpectedStatus(429))
        }
    }

    @Test func transportFailureIsTyped() async {
        StubURLProtocol.reset { _ in throw URLError(.notConnectedToInternet) }

        do {
            _ = try await client.requestCode(email: "a@example.test")
            Issue.record("expected an error")
        } catch {
            guard case .transportFailure = error else {
                Issue.record("expected transportFailure, got \(error)")
                return
            }
        }
    }

    // MARK: verify

    @Test func verifySendsCodeAndRefThenFollowsRedirectURL() async throws {
        let redirect = "https://example.test/members/?token=abc&action=signin&otc_verification=1%3Ah"
        StubURLProtocol.reset(Self.withIntegrityToken { request in
            switch request.url?.path(percentEncoded: false) {
            case "/members/api/verify-otc": return .init(status: 200, body: Self.json(["redirectUrl": redirect]))
            case "/members/": return .init(status: 200)
            default: return .init(status: 404)
            }
        })

        try await client.verify(code: "123456", ref: OTCRef("ref-1"))

        let sent = StubURLProtocol.requests
        #expect(sent.map { $0.url.path(percentEncoded: false) } == ["/members/api/integrity-token/", "/members/api/verify-otc", "/members/"])
        let body = Self.bodyJSON(sent[1])
        #expect(body["otc"] as? String == "123456")
        #expect(body["otcRef"] as? String == "ref-1")
        #expect(body["integrityToken"] as? String == "token-123")
        #expect(sent[2].method == "GET")
        #expect(sent[2].url.absoluteString == redirect)
    }

    @Test func verifyBadRequestIsInvalidCode() async {
        StubURLProtocol.reset(Self.withIntegrityToken { _ in
            .init(status: 400, body: Self.json(["errors": [["code": "INVALID_OTC"]]]))
        })

        do {
            try await client.verify(code: "000000", ref: OTCRef("ref-1"))
            Issue.record("expected an error")
        } catch {
            #expect(error == .invalidCode)
        }
    }

    @Test func verifyRefusesRedirectToAnotherPort() async {
        StubURLProtocol.reset(Self.withIntegrityToken { request in
            request.url?.path(percentEncoded: false) == "/members/api/verify-otc"
                ? .init(status: 200, body: Self.json(["redirectUrl": "https://example.test:8443/members/?token=abc"]))
                : .init(status: 200)
        })

        await #expect(throws: MemberError.self) {
            try await client.verify(code: "123456", ref: OTCRef("ref-1"))
        }
        #expect(!StubURLProtocol.requests.contains { $0.url.port == 8443 })
    }

    @Test func verifyRefusesRedirectToAnotherHost() async {
        StubURLProtocol.reset(Self.withIntegrityToken { request in
            request.url?.path(percentEncoded: false) == "/members/api/verify-otc"
                ? .init(status: 200, body: Self.json(["redirectUrl": "https://elsewhere.test/members/?token=abc"]))
                : .init(status: 200)
        })

        do {
            try await client.verify(code: "123456", ref: OTCRef("ref-1"))
            Issue.record("expected an error")
        } catch {
            guard case .undecodableResponse = error else {
                Issue.record("expected undecodableResponse, got \(error)")
                return
            }
        }
        #expect(!StubURLProtocol.requests.contains { $0.url.host == "elsewhere.test" })
    }

    // MARK: currentMember

    @Test(arguments: [("paid", Member.Status.paid, true), ("comped", .comped, true), ("gift", .gift, true), ("free", .free, false)])
    func currentMemberParsesStatus(raw: String, status: Member.Status, isPaid: Bool) async throws {
        StubURLProtocol.reset { _ in
            .init(status: 200, body: Self.json(["email": "a@example.test", "status": raw, "paid": raw != "free", "uuid": "u"]))
        }

        let member = try await client.currentMember()

        #expect(member == Member(email: "a@example.test", status: status))
        #expect(member?.isPaid == isPaid)
        #expect(StubURLProtocol.requests.map { $0.url.path(percentEncoded: false) } == ["/members/api/member/"])
    }

    @Test func currentMemberNoContentIsSignedOut() async throws {
        StubURLProtocol.reset { _ in .init(status: 204) }
        #expect(try await client.currentMember() == nil)
    }

    @Test func currentMemberBypassesCache() async throws {
        StubURLProtocol.reset { _ in .init(status: 204) }
        _ = try await client.currentMember()
        #expect(StubURLProtocol.requests.map(\.cachePolicy) == [.reloadIgnoringLocalCacheData])
    }

    @Test func currentMemberJSONNullIsSignedOut() async throws {
        StubURLProtocol.reset { _ in .init(status: 200, body: Data("null".utf8)) }
        #expect(try await client.currentMember() == nil)
    }

    @Test func currentMemberUnknownStatusIsUndecodable() async {
        StubURLProtocol.reset { _ in .init(status: 200, body: Self.json(["email": "a@example.test", "status": "lifetime"])) }

        do {
            _ = try await client.currentMember()
            Issue.record("expected an error")
        } catch {
            guard case .undecodableResponse = error else {
                Issue.record("expected undecodableResponse, got \(error)")
                return
            }
        }
    }

    // MARK: signOut

    @Test func signOutDeletesSessionAndClearsSiteCookies() async throws {
        StubURLProtocol.reset { _ in .init(status: 204) }
        let site = HTTPCookie(properties: [.name: "ghost-members-ssr", .value: "x", .domain: "example.test", .path: "/"])
        let other = HTTPCookie(properties: [.name: "keep", .value: "y", .domain: "other.test", .path: "/"])
        for cookie in [site, other].compactMap({ $0 }) { cookies.setCookie(cookie) }

        try await client.signOut()

        #expect(StubURLProtocol.requests.map(\.method) == ["DELETE"])
        #expect(StubURLProtocol.requests.map { $0.url.path(percentEncoded: false) } == ["/members/api/session"])
        #expect(cookies.cookies(for: Self.base)?.isEmpty ?? true)
        #expect(cookies.cookies?.map(\.name) == ["keep"])
    }

    @Test func signOutClearsCookiesEvenWhenServerFails() async {
        StubURLProtocol.reset { _ in throw URLError(.timedOut) }
        if let site = HTTPCookie(properties: [.name: "ghost-members-ssr", .value: "x", .domain: "example.test", .path: "/"]) {
            cookies.setCookie(site)
        }

        do {
            try await client.signOut()
            Issue.record("expected an error")
        } catch {
            guard case .transportFailure = error else {
                Issue.record("expected transportFailure, got \(error)")
                return
            }
        }
        #expect(cookies.cookies(for: Self.base)?.isEmpty ?? true)
    }
}
