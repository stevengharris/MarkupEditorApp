//
//  LogEntryRow.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// One entry of the Log tab: a title line with the level, time and category, and the message below it across the
/// full width. The details of a group are drawn by `LogDetailRow` under the disclosure that holds this row.
struct LogEntryRow: View {

    let entry: LogEntry

    private static let timeStyle = Date.VerbatimFormatStyle(
        format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits):\(second: .twoDigits)",
        timeZone: .current, calendar: .current)

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(entry.level.emoji)
                Text(entry.date, format: Self.timeStyle)
                if let category = entry.category {
                    Text(category)
                }
            }
            .foregroundStyle(Color(nsColor: .secondaryLabelColor))
            Text(Self.counted(entry.message, entry.count))
        }
        .font(.system(.body, design: .monospaced))
        .frame(maxWidth: .infinity, alignment: .leading)
        // The list draws a light gray selection under the row, so the text is set to a color that reads on it.
        .foregroundStyle(Color(nsColor: .labelColor))
    }

    static func counted(_ text: String, _ count: Int) -> String {
        count > 1 ? "\(text) (×\(count))" : text
    }
}

/// One message of a group, shown under the group's entry when it is expanded.
struct LogDetailRow: View {

    let detail: LogDetail

    var body: some View {
        Text("\(detail.level.emoji) \(LogEntryRow.counted(detail.text, detail.count))")
            .font(.system(.body, design: .monospaced))
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Color(nsColor: .labelColor))
    }
}
