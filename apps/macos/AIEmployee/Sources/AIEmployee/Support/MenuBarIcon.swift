import AppKit

enum MenuBarIcon {
    static func image(isRunning: Bool) -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            let ink = NSColor.black

            let workspace = NSBezierPath()
            workspace.move(to: NSPoint(x: 2.25, y: 5.25))
            workspace.line(to: NSPoint(x: 2.25, y: 13.5))
            workspace.curve(
                to: NSPoint(x: 5.0, y: 16.0),
                controlPoint1: NSPoint(x: 2.25, y: 15.0),
                controlPoint2: NSPoint(x: 3.5, y: 16.0)
            )
            workspace.line(to: NSPoint(x: 11.75, y: 16.0))
            workspace.lineWidth = 1.55
            workspace.lineCapStyle = .round
            workspace.lineJoinStyle = .round
            ink.setStroke()
            workspace.stroke()

            let workflow = NSBezierPath()
            workflow.move(to: NSPoint(x: 1.75, y: 10.75))
            workflow.line(to: NSPoint(x: 6.0, y: 10.75))
            workflow.curve(
                to: NSPoint(x: 9.0, y: 13.5),
                controlPoint1: NSPoint(x: 7.8, y: 10.75),
                controlPoint2: NSPoint(x: 7.35, y: 13.5)
            )
            workflow.curve(
                to: NSPoint(x: 12.0, y: 8.0),
                controlPoint1: NSPoint(x: 11.7, y: 13.5),
                controlPoint2: NSPoint(x: 10.15, y: 8.0)
            )
            workflow.line(to: NSPoint(x: 16.0, y: 8.0))
            workflow.lineWidth = 2.15
            workflow.lineCapStyle = .round
            workflow.lineJoinStyle = .round
            ink.setStroke()
            workflow.stroke()

            let statusRect = NSRect(x: 13.0, y: 2.0, width: 3.25, height: 3.25)
            let status = NSBezierPath(ovalIn: statusRect)
            if isRunning {
                ink.setFill()
                status.fill()
            } else {
                status.lineWidth = 1.15
                ink.setStroke()
                status.stroke()
            }
            return true
        }
        image.isTemplate = true
        return image
    }
}
