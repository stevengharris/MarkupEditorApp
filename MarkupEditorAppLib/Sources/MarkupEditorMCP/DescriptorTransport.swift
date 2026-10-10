//
//  DescriptorTransport.swift
//  MarkupEditorMCP
//

import Foundation
import Logging
import MarkupEditorAppLib
import MCP

/// Newline-delimited JSON over a pair of descriptors. Input is read on a dedicated thread so a
/// blocking read never holds a cooperative-pool thread, and the descriptors stay in blocking mode.
actor DescriptorTransport: Transport {
    nonisolated let logger = Logger(label: "markupeditor.mcp.transport", factory: { _ in SwiftLogNoOpLogHandler() })

    private let input: Int32
    private let output: Int32
    private let stream: AsyncThrowingStream<Data, Swift.Error>
    private let continuation: AsyncThrowingStream<Data, Swift.Error>.Continuation
    private var started = false

    init(input: Int32, output: Int32) {
        self.input = input
        self.output = output
        (stream, continuation) = AsyncThrowingStream.makeStream()
    }

    func connect() async throws {
        guard !started else { return }
        started = true
        // If the client closes our output, a write should fail quietly; the loop ends when input closes.
        UnixSocket.suppressSigPipe(output)
        let descriptor = input
        let continuation = continuation
        let reader = Thread {
            var buffer: [UInt8] = []
            while let line = try? UnixSocket.readLine(from: descriptor, buffer: &buffer) {
                if !line.isEmpty { continuation.yield(line) }
            }
            continuation.finish()
        }
        reader.name = "MCPServer.stdin"
        reader.start()
    }

    func disconnect() async {
        continuation.finish()
    }

    func send(_ data: Data) async throws {
        try UnixSocket.writeLine(data, to: output)
    }

    func receive() -> AsyncThrowingStream<Data, Swift.Error> {
        stream
    }
}
