//
//  UpdateLogFilterTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct UpdateLogFilterTests {

    private let kinds: [UpdateLogFilter.Kind] = [.userStarted, .background, .information]

    private func sparkle(_ code: Int, userInfo: [String: Any] = [:]) -> NSError {
        NSError(domain: "SUSparkleErrorDomain", code: code, userInfo: userInfo)
    }

    @Test func aNilErrorIsSkippedForEveryKind() {
        for kind in kinds {
            #expect(UpdateLogFilter.action(kind: kind, error: nil) == .skip)
        }
    }

    @Test func cancelledAndAuthorizeLaterAreSkippedForEveryKind() {
        for kind in kinds {
            #expect(UpdateLogFilter.action(kind: kind, error: sparkle(4007)) == .skip)
            #expect(UpdateLogFilter.action(kind: kind, error: sparkle(4008)) == .skip)
        }
    }

    @Test func theNotConnectedRefusalIsSkippedForEveryKind() {
        for kind in kinds {
            #expect(UpdateLogFilter.action(kind: kind, error: UpdateLogFilter.refusalError(.notConnected)) == .skip)
        }
    }

    @Test func anInvalidFeedRefusalIsAnErrorRecordedOnce() {
        for kind in kinds {
            let action = UpdateLogFilter.action(kind: kind, error: UpdateLogFilter.refusalError(.invalidFeed))
            #expect(action == .error("The update feed override is not a valid URL.", once: "update-invalid-feed"))
        }
    }

    @Test func noUpdateOnAUserStartedOrBackgroundCheckSaysUpToDate() {
        let none = UpdateLogFilter.Action.info("Checked for updates: up to date", once: nil)
        for kind in [UpdateLogFilter.Kind.userStarted, .background] {
            #expect(UpdateLogFilter.action(kind: kind, error: sparkle(1001)) == none)
            for reason in [0, 1, 2] {
                let error = sparkle(1001, userInfo: ["SUNoUpdateFoundReason": NSNumber(value: reason)])
                #expect(UpdateLogFilter.action(kind: kind, error: error) == none)
            }
        }
    }

    @Test func noUpdateForASystemReasonStatesTheReason() throws {
        let reasons: [(Int, String)] = [
            (3, "too old"), (4, "too new"), (5, "Apple silicon"),
        ]
        for (reason, fragment) in reasons {
            let error = sparkle(1001, userInfo: ["SUNoUpdateFoundReason": NSNumber(value: reason)])
            guard case .info(let message, let once) = UpdateLogFilter.action(kind: .userStarted, error: error) else {
                Issue.record("expected an information entry for reason \(reason)")
                continue
            }
            #expect(message.contains(fragment))
            #expect(!message.contains("up to date"))
            #expect(once == nil)
        }
    }

    @Test func noUpdateOnAnInformationProbeIsSkipped() {
        #expect(UpdateLogFilter.action(kind: .information, error: sparkle(1001)) == .skip)
    }

    @Test func aNetworkErrorIsInformationRecordedOnce() {
        let expected = UpdateLogFilter.Action.info("Could not check for updates: no network connection", once: "update-offline")
        for code in [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff] {
            let error = NSError(domain: NSURLErrorDomain, code: code)
            for kind in kinds {
                #expect(UpdateLogFilter.action(kind: kind, error: error) == expected)
            }
        }
    }

    @Test func aHostThatCannotBeReachedIsAFeedErrorNotOffline() {
        for code in [NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed, NSURLErrorTimedOut, NSURLErrorCannotConnectToHost] {
            let error = NSError(domain: NSURLErrorDomain, code: code, userInfo: [NSLocalizedDescriptionKey: "unreachable"])
            for kind in kinds {
                #expect(UpdateLogFilter.action(kind: kind, error: error) == .error("Update check failed: unreachable", once: nil))
            }
        }
    }

    @Test func aNetworkErrorWrappedBySparkleIsStillOffline() {
        let underlying = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        for code in [1002, 2001] {
            let wrapped = sparkle(code, userInfo: [NSUnderlyingErrorKey: underlying])
            #expect(UpdateLogFilter.action(kind: .background, error: wrapped) == .info("Could not check for updates: no network connection", once: "update-offline"))
        }
    }

    @Test func aDownloadFailureThatIsNotOfflineIsAnError() {
        let underlying = NSError(domain: NSURLErrorDomain, code: NSURLErrorBadServerResponse)
        let error = sparkle(2001, userInfo: [NSUnderlyingErrorKey: underlying, NSLocalizedDescriptionKey: "An error occurred while downloading the update."])
        #expect(UpdateLogFilter.action(kind: .userStarted, error: error) == .error("Update download failed: An error occurred while downloading the update.", once: nil))
    }

    @Test func anyOtherErrorIsAnErrorForEveryKind() {
        let error = NSError(domain: "Other", code: 7, userInfo: [NSLocalizedDescriptionKey: "Broke"])
        for kind in kinds {
            #expect(UpdateLogFilter.action(kind: kind, error: error) == .error("Update check failed: Broke", once: nil))
        }
    }

    @Test func theRefusalErrorsCarryTheirDomainAndDistinctCodes() {
        let notConnected = UpdateLogFilter.refusalError(.notConnected)
        let invalidFeed = UpdateLogFilter.refusalError(.invalidFeed)
        #expect(notConnected.domain == "com.stevengharris.MarkupEditorApp.updates")
        #expect(invalidFeed.domain == notConnected.domain)
        #expect(notConnected.code != invalidFeed.code)
        #expect(notConnected.localizedDescription == "Updates require a connected markupeditor.app subscription.")
    }
}
