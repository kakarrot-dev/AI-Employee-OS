import Foundation

enum MarkdownBlock: Equatable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bullet(String)
    case numbered(String)
    case quote(String)
    case code(String)
    case table(headers: [String], rows: [[String]])
    case divider
    case spacing

    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var codeLines: [String] = []
        var isInCodeBlock = false

        let lines = source.components(separatedBy: .newlines)
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if line.hasPrefix("```") {
                if isInCodeBlock {
                    blocks.append(.code(codeLines.joined(separator: "\n")))
                    codeLines.removeAll(keepingCapacity: true)
                }
                isInCodeBlock.toggle()
                index += 1
                continue
            }
            if isInCodeBlock {
                codeLines.append(line)
                index += 1
                continue
            }

            if index + 1 < lines.count,
               let headers = tableCells(in: line),
               isTableSeparator(lines[index + 1], columnCount: headers.count) {
                var rows: [[String]] = []
                index += 2
                while index < lines.count, let cells = tableCells(in: lines[index]), cells.count == headers.count {
                    rows.append(cells)
                    index += 1
                }
                blocks.append(.table(headers: headers, rows: rows))
                continue
            }

            if line.hasPrefix("### ") { blocks.append(.heading(level: 3, text: String(line.dropFirst(4)))) }
            else if line.hasPrefix("## ") { blocks.append(.heading(level: 2, text: String(line.dropFirst(3)))) }
            else if line.hasPrefix("# ") { blocks.append(.heading(level: 1, text: String(line.dropFirst(2)))) }
            else if line.hasPrefix("- ") || line.hasPrefix("* ") { blocks.append(.bullet(String(line.dropFirst(2)))) }
            else if line.hasPrefix("> ") { blocks.append(.quote(String(line.dropFirst(2)))) }
            else if line.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
                let text = line.replacingOccurrences(of: #"^\d+\.\s"#, with: "", options: .regularExpression)
                blocks.append(.numbered(text))
            }
            else if ["---", "***", "___"].contains(line) { blocks.append(.divider) }
            else if line.trimmingCharacters(in: .whitespaces).isEmpty { blocks.append(.spacing) }
            else { blocks.append(.paragraph(line)) }
            index += 1
        }

        if isInCodeBlock || !codeLines.isEmpty {
            blocks.append(.code(codeLines.joined(separator: "\n")))
        }
        return blocks
    }

    private static func tableCells(in line: String) -> [String]? {
        guard line.contains("|") else { return nil }
        var content = line.trimmingCharacters(in: .whitespaces)
        if content.hasPrefix("|") { content.removeFirst() }
        if content.hasSuffix("|") { content.removeLast() }
        let cells = content.split(separator: "|", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        return cells.count >= 2 ? cells : nil
    }

    private static func isTableSeparator(_ line: String, columnCount: Int) -> Bool {
        guard let cells = tableCells(in: line), cells.count == columnCount else { return false }
        return cells.allSatisfy { cell in
            cell.range(of: #"^:?-{3,}:?$"#, options: .regularExpression) != nil
        }
    }
}
