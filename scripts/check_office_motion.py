from pathlib import Path


SOURCE = Path("apps/macos/AIEmployee/Sources/AIEmployee/Views/Office/OfficeWorkspaceView.swift")
text = SOURCE.read_text(encoding="utf-8")
snapshot = Path("apps/macos/AIEmployee/Sources/AIEmployee/Models/OfficeSnapshot.swift").read_text(encoding="utf-8")
runtime = Path("runtime/rust-core/src/main.rs").read_text(encoding="utf-8")
content = Path("apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift").read_text(encoding="utf-8")

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

assert "从一个清晰目标开始，确认方案后再交给员工执行。" in text, (
    "office header must explain the primary task handoff in plain language"
)
assert 'section(title: "用量概览", subtitle: hasData ? "最近 7 天的模型调用与 Token 消耗"' in text, (
    "office usage section must explain the seven-day overview in plain language"
)
for removed_copy in ["当前工作", "进行中的工作", "需要你处理", "正在推进"]:
    assert removed_copy not in text, f"office must not render work status copy: {removed_copy}"
assert "OfficeSnapshot.EmployeeItem(id: \"alex\"" not in snapshot and "demo-running" not in snapshot, (
    "usage-only Office demos must not retain obsolete employee or work fixtures"
)
assert "USAGE_PRICING_VERSION" in runtime and '"pricing_version": USAGE_PRICING_VERSION' in runtime, (
    "estimated cost must expose the exact pricing configuration version"
)
assert "CreamComposer(" in text and "size: .expanded" in text, (
    "office task entry must reuse the expanded shared Composer"
)
assert ".creamFloatingComposer(" not in text, (
    "office must not bypass the shared Composer with a local surface implementation"
)
assert "任务已保存" not in text and "任务已交给 Runtime 执行" not in text, (
    "office must not duplicate Task persistence status"
)
assert "store.proposeWork()" in text and "openWork()" in text, (
    "office submit must start proposal generation and navigate to Work"
)
assert "OfficeWorkspaceView(store: store, employeeStore: employeeStore, openWork:" in content, (
    "root navigation must own the Office to Work transition"
)

print("office motion checks: ok")
