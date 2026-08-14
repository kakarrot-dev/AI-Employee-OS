import AppKit
import SwiftUI

/// Narrow AppKit bridge for the text-system behavior SwiftUI's multiline TextField cannot
/// disambiguate reliably: Return submits, while Shift-Return inserts a newline at the selection.
struct CreamComposerTextView: NSViewRepresentable {
    @Binding var text: String
    let accessibilityLabel: String
    let colorScheme: ColorScheme
    let isEnabled: Bool
    let minimumHeight: CGFloat
    let maximumLines: Int
    let onFocusChange: (Bool) -> Void
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, onFocusChange: onFocusChange, onSubmit: onSubmit)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let textStorage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        let textContainer = NSTextContainer(size: .zero)
        textStorage.addLayoutManager(layoutManager)
        layoutManager.addTextContainer(textContainer)

        let textView = ComposerNativeTextView(frame: .zero, textContainer: textContainer)
        textView.delegate = context.coordinator
        textView.onReturn = context.coordinator.handleReturn
        textView.drawsBackground = false
        textView.isRichText = false
        textView.importsGraphics = false
        textView.allowsUndo = true
        textView.usesFindBar = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.textContainerInset = .zero
        textView.textContainer?.lineFragmentPadding = 0
        textView.textContainer?.widthTracksTextView = true
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.font = Self.font

        let scrollView = NSScrollView()
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        scrollView.hasHorizontalScroller = false
        scrollView.hasVerticalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay
        scrollView.documentView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? ComposerNativeTextView else { return }
        context.coordinator.onFocusChange = onFocusChange
        context.coordinator.onSubmit = onSubmit

        if textView.string != text {
            textView.string = text
        }
        textView.font = Self.font
        textView.textColor = colors.body
        textView.insertionPointColor = colors.body
        textView.isEditable = isEnabled
        textView.isSelectable = true
        textView.setAccessibilityLabel(accessibilityLabel)

        let width = max(scrollView.contentSize.width, 1)
        let contentHeight = measuredContentHeight(for: textView, width: width)
        scrollView.hasVerticalScroller = contentHeight > maximumHeight
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        nsView scrollView: NSScrollView,
        context: Context
    ) -> CGSize? {
        guard let width = proposal.width, width > 0,
              let textView = scrollView.documentView as? ComposerNativeTextView else { return nil }
        let contentHeight = measuredContentHeight(for: textView, width: width)
        let height = min(max(contentHeight, minimumHeight), maximumHeight)
        textView.frame = CGRect(x: 0, y: 0, width: width, height: max(contentHeight, height))
        scrollView.hasVerticalScroller = contentHeight > maximumHeight
        return CGSize(width: width, height: height)
    }

    private func measuredContentHeight(for textView: NSTextView, width: CGFloat) -> CGFloat {
        guard let textContainer = textView.textContainer,
              let layoutManager = textView.layoutManager else { return minimumHeight }
        textContainer.containerSize = CGSize(width: width, height: .greatestFiniteMagnitude)
        layoutManager.ensureLayout(for: textContainer)
        return ceil(max(layoutManager.usedRect(for: textContainer).height, Self.lineHeight))
    }

    private var maximumHeight: CGFloat {
        ceil(Self.lineHeight * CGFloat(maximumLines))
    }

    private var colors: ComposerTextColors {
        colorScheme == .dark ? .dark : .light
    }

    private static let font = NSFont.systemFont(
        ofSize: AppTheme.Typography.interfaceBodySize,
        weight: .regular
    )
    private static let lineHeight = ceil(NSLayoutManager().defaultLineHeight(for: font))

    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding private var text: String
        var onFocusChange: (Bool) -> Void
        var onSubmit: () -> Void

        init(
            text: Binding<String>,
            onFocusChange: @escaping (Bool) -> Void,
            onSubmit: @escaping () -> Void
        ) {
            _text = text
            self.onFocusChange = onFocusChange
            self.onSubmit = onSubmit
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView,
                  text != textView.string else { return }
            text = textView.string
        }

        func textDidBeginEditing(_ notification: Notification) {
            onFocusChange(true)
        }

        func textDidEndEditing(_ notification: Notification) {
            onFocusChange(false)
        }

        func handleReturn(shiftPressed: Bool) {
            if shiftPressed {
                return
            }
            onSubmit()
        }
    }
}

private final class ComposerNativeTextView: NSTextView {
    var onReturn: ((Bool) -> Void)?

    override func keyDown(with event: NSEvent) {
        let isReturn = event.keyCode == 36 || event.keyCode == 76
        guard isReturn, !hasMarkedText() else {
            super.keyDown(with: event)
            return
        }

        let shiftPressed = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.shift)
        if shiftPressed {
            insertNewline(nil)
        }
        onReturn?(shiftPressed)
    }
}

private struct ComposerTextColors {
    let body: NSColor

    static let light = ComposerTextColors(body: NSColor(
        srgbRed: 0x40 / 255,
        green: 0x3D / 255,
        blue: 0x36 / 255,
        alpha: 1
    ))
    static let dark = ComposerTextColors(body: NSColor(
        srgbRed: 0xDD / 255,
        green: 0xD9 / 255,
        blue: 0xCD / 255,
        alpha: 1
    ))
}
