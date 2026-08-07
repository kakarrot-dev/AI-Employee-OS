import AppKit
import SwiftUI

/// A narrow AppKit bridge for native macOS text interaction inside the SwiftUI message stream.
/// One NSTextView owns the complete message so the insertion cursor and selection can cross Markdown blocks.
struct SelectableMarkdownTextView: NSViewRepresentable {
    let source: String
    let colorScheme: ColorScheme

    func makeNSView(context: Context) -> NSTextView {
        let textStorage = NSTextStorage()
        let layoutManager = MarkdownLayoutManager()
        let textContainer = NSTextContainer(size: .zero)
        textStorage.addLayoutManager(layoutManager)
        layoutManager.addTextContainer(textContainer)
        let textView = NSTextView(frame: .zero, textContainer: textContainer)
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.isRichText = true
        textView.allowsUndo = false
        textView.textContainerInset = .zero
        textView.textContainer?.lineFragmentPadding = 0
        textView.textContainer?.widthTracksTextView = true
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.linkTextAttributes = [
            .foregroundColor: colors.accent,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        return textView
    }

    func updateNSView(_ textView: NSTextView, context: Context) {
        let rendered = Self.render(source, colors: colors)
        if textView.textStorage?.isEqual(to: rendered) != true {
            textView.textStorage?.setAttributedString(rendered)
        }
        textView.linkTextAttributes = [
            .foregroundColor: colors.accent,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSTextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0,
              let textContainer = nsView.textContainer,
              let layoutManager = nsView.layoutManager else { return nil }
        textContainer.containerSize = CGSize(width: width, height: .greatestFiniteMagnitude)
        layoutManager.ensureLayout(for: textContainer)
        let height = ceil(layoutManager.usedRect(for: textContainer).height)
        return CGSize(width: width, height: max(20, height))
    }

    private var colors: MarkdownColors {
        colorScheme == .dark ? .dark : .light
    }

    private static func render(_ source: String, colors: MarkdownColors) -> NSAttributedString {
        let output = NSMutableAttributedString()
        let blocks = MarkdownBlock.parse(source)

        for (index, block) in blocks.enumerated() {
            let isLast = index == blocks.indices.last
            switch block {
            case .heading(let level, let text):
                appendInline(
                    text,
                    to: output,
                    font: MarkdownTypography.headingFont(level),
                    color: colors.ink,
                    lineSpacing: MarkdownTypography.headingLineSpacing,
                    spacingBefore: index == 0 ? 0 : MarkdownTypography.headingSpacingBefore,
                    spacingAfter: MarkdownTypography.headingSpacingAfter
                )
            case .paragraph(let text):
                appendInline(
                    text,
                    to: output,
                    font: MarkdownTypography.bodyFont,
                    color: colors.body,
                    lineSpacing: MarkdownTypography.bodyLineSpacing,
                    spacingAfter: MarkdownTypography.paragraphSpacing
                )
            case .bullet(let text):
                appendInline(
                    "•  \(text)",
                    to: output,
                    font: MarkdownTypography.listFont,
                    color: colors.body,
                    lineSpacing: MarkdownTypography.listLineSpacing,
                    headIndent: 20,
                    firstLineHeadIndent: 2,
                    spacingAfter: MarkdownTypography.listSpacing
                )
            case .numbered(let text):
                appendInline(
                    text,
                    to: output,
                    font: MarkdownTypography.listFont,
                    color: colors.body,
                    lineSpacing: MarkdownTypography.listLineSpacing,
                    headIndent: 24,
                    firstLineHeadIndent: 2,
                    spacingAfter: MarkdownTypography.listSpacing
                )
            case .quote(let text):
                appendInline(
                    text,
                    to: output,
                    font: MarkdownTypography.listFont,
                    color: colors.muted,
                    lineSpacing: MarkdownTypography.listLineSpacing,
                    headIndent: 16,
                    firstLineHeadIndent: 16,
                    spacingAfter: MarkdownTypography.paragraphSpacing,
                    extraAttributes: [.markdownQuoteAccent: colors.quoteAccent]
                )
            case .code(let text):
                appendPlain(
                    text,
                    to: output,
                    font: MarkdownTypography.codeFont,
                    color: colors.body,
                    lineSpacing: MarkdownTypography.codeLineSpacing,
                    kern: MarkdownTypography.codeKern,
                    background: colors.codeBackground,
                    spacingAfter: MarkdownTypography.blockSpacing
                )
            case .table(let headers, let rows):
                let lines = ([headers] + rows).map { $0.joined(separator: "    ") }.joined(separator: "\n")
                appendPlain(
                    lines,
                    to: output,
                    font: MarkdownTypography.codeFont,
                    color: colors.body,
                    lineSpacing: MarkdownTypography.codeLineSpacing,
                    kern: MarkdownTypography.codeKern,
                    background: colors.codeBackground,
                    spacingAfter: MarkdownTypography.blockSpacing
                )
            case .divider:
                appendPlain(
                    "────────",
                    to: output,
                    font: .systemFont(ofSize: 11),
                    color: colors.divider,
                    lineSpacing: 0,
                    kern: 0,
                    spacingAfter: MarkdownTypography.paragraphSpacing
                )
            case .spacing:
                output.append(NSAttributedString(string: "\n"))
                continue
            }
            if !isLast { output.append(NSAttributedString(string: "\n")) }
        }
        return output
    }

    private static func appendInline(
        _ source: String,
        to output: NSMutableAttributedString,
        font: NSFont,
        color: NSColor,
        lineSpacing: CGFloat,
        spacingBefore: CGFloat = 0,
        headIndent: CGFloat = 0,
        firstLineHeadIndent: CGFloat = 0,
        spacingAfter: CGFloat,
        extraAttributes: [NSAttributedString.Key: Any] = [:]
    ) {
        let parsed = try? AttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )
        let value = parsed.map(NSAttributedString.init) ?? NSAttributedString(string: source)
        let mutable = NSMutableAttributedString(attributedString: value)
        let range = NSRange(location: 0, length: mutable.length)
        mutable.addAttribute(.foregroundColor, value: color, range: range)
        mutable.enumerateAttribute(.font, in: range) { existing, range, _ in
            if existing == nil { mutable.addAttribute(.font, value: font, range: range) }
        }
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = lineSpacing
        paragraph.paragraphSpacingBefore = spacingBefore
        paragraph.paragraphSpacing = spacingAfter
        paragraph.headIndent = headIndent
        paragraph.firstLineHeadIndent = firstLineHeadIndent
        mutable.addAttribute(.paragraphStyle, value: paragraph, range: range)
        extraAttributes.forEach { mutable.addAttribute($0.key, value: $0.value, range: range) }
        output.append(mutable)
    }

    private static func appendPlain(
        _ source: String,
        to output: NSMutableAttributedString,
        font: NSFont,
        color: NSColor,
        lineSpacing: CGFloat,
        kern: CGFloat,
        background: NSColor? = nil,
        spacingAfter: CGFloat
    ) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = lineSpacing
        paragraph.paragraphSpacing = spacingAfter
        if background != nil {
            paragraph.headIndent = 10
            paragraph.firstLineHeadIndent = 10
            paragraph.tailIndent = -10
            paragraph.paragraphSpacingBefore = 6
        }
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
            .kern: kern,
        ]
        if let background { attributes[.markdownBlockBackground] = background }
        output.append(NSAttributedString(string: source, attributes: attributes))
    }

}

private enum MarkdownTypography {
    static let bodyFont = NSFont.systemFont(ofSize: 16, weight: .regular)
    static let listFont = NSFont.systemFont(ofSize: 15.5, weight: .regular)
    static let codeFont = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
    static let bodyLineSpacing: CGFloat = 6
    static let listLineSpacing: CGFloat = 5
    static let codeLineSpacing: CGFloat = 4
    static let headingLineSpacing: CGFloat = 2
    static let paragraphSpacing: CGFloat = 8
    static let listSpacing: CGFloat = 4
    static let blockSpacing: CGFloat = 12
    static let headingSpacingBefore: CGFloat = 12
    static let headingSpacingAfter: CGFloat = 6
    static let codeKern: CGFloat = 0.1

    static func headingFont(_ level: Int) -> NSFont {
        switch level {
        case 1: .systemFont(ofSize: 21, weight: .semibold)
        case 2: .systemFont(ofSize: 18, weight: .semibold)
        default: .systemFont(ofSize: 16, weight: .semibold)
        }
    }
}

private final class MarkdownLayoutManager: NSLayoutManager {
    override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        guard let textStorage, let textContainer = textContainers.first else {
            super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
            return
        }

        let charactersToShow = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        textStorage.enumerateAttribute(.markdownBlockBackground, in: charactersToShow) { value, characterRange, _ in
            guard let color = value as? NSColor else { return }
            let glyphRange = self.glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
            let textRect = self.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            let surfaceRect = NSRect(
                x: origin.x + 2,
                y: origin.y + textRect.minY - 6,
                width: max(0, textContainer.size.width - 4),
                height: textRect.height + 12
            )
            let path = NSBezierPath(roundedRect: surfaceRect, xRadius: 10, yRadius: 10)
            color.setFill()
            path.fill()
        }

        textStorage.enumerateAttribute(.markdownQuoteAccent, in: charactersToShow) { value, characterRange, _ in
            guard let color = value as? NSColor else { return }
            let glyphRange = self.glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
            let textRect = self.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            color.setFill()
            NSBezierPath(
                roundedRect: NSRect(x: origin.x + 2, y: origin.y + textRect.minY, width: 2, height: textRect.height),
                xRadius: 1,
                yRadius: 1
            ).fill()
        }

        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    }
}

private extension NSAttributedString.Key {
    static let markdownBlockBackground = NSAttributedString.Key("AIEmployee.MarkdownBlockBackground")
    static let markdownQuoteAccent = NSAttributedString.Key("AIEmployee.MarkdownQuoteAccent")
}

private struct MarkdownColors {
    let ink: NSColor
    let body: NSColor
    let muted: NSColor
    let accent: NSColor
    let codeBackground: NSColor
    let quoteAccent: NSColor
    let divider: NSColor

    static let light = MarkdownColors(
        ink: NSColor(hex: 0x29271D), body: NSColor(hex: 0x403D36), muted: NSColor(hex: 0x6D675B),
        accent: NSColor(hex: 0x9F6819), codeBackground: NSColor(hex: 0xEFEFEB),
        quoteAccent: NSColor(hex: 0xB7791F).withAlphaComponent(0.48), divider: NSColor(hex: 0x8D8575).withAlphaComponent(0.55)
    )
    static let dark = MarkdownColors(
        ink: NSColor(hex: 0xE9E6DC), body: NSColor(hex: 0xDDD9CD), muted: NSColor(hex: 0xBBB6A8),
        accent: NSColor(hex: 0xF0CF92), codeBackground: NSColor(hex: 0x292A29),
        quoteAccent: NSColor(hex: 0xE6BF7A).withAlphaComponent(0.52), divider: NSColor(hex: 0x8C887E).withAlphaComponent(0.62)
    )
}

private extension NSColor {
    convenience init(hex: UInt32) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
