from pathlib import Path


SOURCE = Path("apps/macos/AIEmployee/Sources/AIEmployee/Views/Office/OfficeWorkspaceView.swift")
text = SOURCE.read_text(encoding="utf-8")

required = {
    "explicit animation progress": "@State private var dataAnimationProgress = 0.0",
    "replay on data update": ".onChange(of: snapshotRevision)",
    "numeric interpolation": "private struct CountingMetricText: View, Animatable",
    "line draw mask": ".chartPlotStyle { plotArea in",
    "reduced motion boundary": "guard !reduceMotion else",
}

missing = [name for name, marker in required.items() if marker not in text]
if missing:
    raise SystemExit(f"office motion contract missing: {', '.join(missing)}")

print("office motion checks: ok")
