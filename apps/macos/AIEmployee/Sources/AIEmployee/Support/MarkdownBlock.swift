import Foundation

enum MarkdownBlock: Equatable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bullet(String)
    case numbered(String)
    case quote(String)
    case code(String)
    case divider
    case spacing

    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var codeLines: [String] = []
        var isInCodeBlock = false

        for line in source.components(separatedBy: .newlines) {
            if line.hasPrefix("```") {
                if isInCodeBlock {
                    blocks.append(.code(codeLines.joined(separator: "\n")))
                    codeLines.removeAll(keepingCapacity: true)
                }
                isInCodeBlock.toggle()
                continue
            }
            if isInCodeBlock {
                codeLines.append(line)
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
        }

        if isInCodeBlock || !codeLines.isEmpty {
            blocks.append(.code(codeLines.joined(separator: "\n")))
        }
        return blocks
    }
}
