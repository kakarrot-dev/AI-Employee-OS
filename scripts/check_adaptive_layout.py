#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


source_root = ROOT / "apps/macos/AIEmployee/Sources/AIEmployee"
all_swift = "\n".join(path.read_text(encoding="utf-8") for path in source_root.rglob("*.swift"))
layout = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/AppLayout.swift")
templates = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/AdaptiveLayouts.swift")
shell = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/AppShellView.swift")
office = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Office/OfficeWorkspaceView.swift")
contacts = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Employees/EmployeeDirectoryView.swift")
work = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift")
archive = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Archive/ArchiveWorkspaceView.swift")
chat = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift")
knowledge = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/KnowledgeLibraryWorkspaceView.swift")
capabilities = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/SupportingWorkspaces.swift")
scenarios = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/ScenarioLibraryWorkspaceView.swift")
settings = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/SettingsView.swift")
controls = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/CreamControls.swift")
app = source("apps/macos/AIEmployee/Sources/AIEmployee/App/AIEmployeeApp.swift")

assert "appWindowWidth" not in all_swift, "menu pages must not receive raw window width"
assert "compactShellWidth: CGFloat = 960" in layout
assert "compactHeight: CGFloat = 600" in layout
assert "AppLayoutCoordinator" in templates and "AppLayoutContext" in templates
assert "struct AdaptivePage" in templates
assert "struct AdaptiveBrowser" in templates
assert "struct AdaptiveWorkspace" in templates
assert templates.count(".creamPaneSurface(.collection)") >= 3, (
    "shared collection panes must use the soft collection surface"
)
assert ".creamPaneSurface(.collection)\n                            .frame(" in templates, (
    "adaptive browser must keep collection chrome inside its width budget"
)
assert ".creamPaneSurface(.collection)\n            .frame(" in templates, (
    "adaptive workspace must keep collection chrome inside its width budget"
)
assert "if compactShowsDetail" in templates and "if compactShowsPrimary" in templates, (
    "single-pane templates must remove hidden panes from the rendered hierarchy"
)
assert "NavigationSplitView(columnVisibility:" in shell
assert "globalSidebarPreferred" not in shell, "Scene preference belongs to ContentView, not the shell implementation"

assert "AdaptivePage(profile: .office)" in office
assert "AdaptivePage(profile: .archive)" in archive
assert "AdaptiveBrowser(profile: .contacts" in contacts
assert "static let tabbedDetailContentMaxWidth: CGFloat = 820" in layout
assert "CreamTabbedPageContainer" in contacts
assert 'MarkdownDocumentView(source: markdown, maxWidth: .infinity, showsSurface: false)' in contacts
assert "CreamTabContentSection(title, subtitle: detail)" in contacts
assert ".frame(maxWidth: 900" not in contacts and ".frame(maxWidth: 600" not in contacts, (
    "contacts profile header, tabs, and body must share the AppLayoutProfile width"
)
assert "AdaptiveBrowser(profile: .knowledge" in knowledge
assert "AdaptiveBrowser(profile: .capabilities" in capabilities
assert "AdaptiveBrowser(profile: .skillPackage" in capabilities
assert capabilities.count("CreamTabbedPageContainer") >= 3
assert capabilities.count("showsWorkspaceSurface: true") == 1, (
    "only the edge-to-edge Skill package browser should use the tab workspace pane"
)
assert "CreamTabContentSection(tabContentTitle, subtitle: tabContentSubtitle)" in capabilities
assert scenarios.count("CreamTabbedPageContainer") >= 4
assert scenarios.count("showsWorkspaceSurface: true") >= 3
assert "AdaptiveBrowser(profile: .settings" in settings
assert "NavigationSplitView" not in settings, "settings must reuse the shared browser skeleton"
assert "AdaptiveWorkspace(" in work and "profile: .work" in work
assert "AdaptiveWorkspace(" in chat and "profile: .employeeChat" in chat
assert "AppLayoutProfile.work.primary.maxWidth" in work
assert "AppLayoutProfile.employeeChat.primary.maxWidth" in chat
assert "@SceneStorage(\"workInspectorPreferred\")" in work
assert "@SceneStorage(\"taskInspectorVisible\")" in chat
assert '.windowToolbarStyle(.unifiedCompact(showsTitle: true))' in app
assert 'if #available(macOS 26.0, *)' in controls
assert '.sharedBackgroundVisibility(.hidden)' in controls
assert controls.count('ToolbarItem(placement: .principal)') == 2, "macOS 26 and legacy toolbar titles must both be explicit"

print("adaptive layout checks: ok")
