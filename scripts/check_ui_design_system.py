#!/usr/bin/env python3
"""Static guardrails for the macOS UI token and component contract."""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SWIFT_ROOT = ROOT / "apps/macos/AIEmployee/Sources/AIEmployee"
THEME = SWIFT_ROOT / "DesignSystem/AppTheme.swift"
APP_LAYOUT = SWIFT_ROOT / "DesignSystem/AppLayout.swift"
COMPONENTS = SWIFT_ROOT / "DesignSystem/CreamComponentLibrary.swift"
CONTROLS = SWIFT_ROOT / "DesignSystem/CreamControls.swift"
COMPOSER = SWIFT_ROOT / "DesignSystem/CreamComposer.swift"
COMPOSER_INPUT = SWIFT_ROOT / "DesignSystem/CreamComposerTextView.swift"
TIMELINE = SWIFT_ROOT / "DesignSystem/CreamTimeline.swift"
COMMAND_PALETTE = SWIFT_ROOT / "Views/CommandPaletteView.swift"
EMPLOYEE_DIRECTORY = SWIFT_ROOT / "Views/Employees/EmployeeDirectoryView.swift"
CONTENT_VIEW = SWIFT_ROOT / "Views/ContentView.swift"
CONTRACT = ROOT / "docs/design-system/AI Employee macOS UI Token & Component Contract v1.0.md"
PREVIEW = ROOT / "docs/design-system/AI Employee macOS Component Library Preview.html"


def declaration_block(source: str, declaration: str) -> str:
    """Return one Swift declaration body without relying on fragile multiline regexes."""
    start = source.find(declaration)
    if start < 0:
        return ""
    brace = source.find("{", start)
    if brace < 0:
        return ""
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    return ""


def relative_luminance(hex_value: str) -> float:
    channels = [int(hex_value[index : index + 2], 16) / 255 for index in (0, 2, 4)]

    def linearize(channel: float) -> float:
        if channel <= 0.04045:
            return channel / 12.92
        return math.pow((channel + 0.055) / 1.055, 2.4)

    red, green, blue = map(linearize, channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(foreground: str, background: str) -> float:
    first = relative_luminance(foreground)
    second = relative_luminance(background)
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


def palette_block(source: str, scheme: str) -> dict[str, str]:
    if scheme == "dark":
        match = re.search(r"if scheme == \.dark \{\s*return Palette\((.*?)\n\s*\)\s*\}", source, re.DOTALL)
    else:
        match = re.search(r"\}\s*return Palette\((.*?)\n\s*\)\s*\n\s*\}", source, re.DOTALL)
    if match is None:
        return {}
    return {
        role: value.upper()
        for role, value in re.findall(r"(\w+): Color\(hex: 0x([0-9A-Fa-f]{6})\)", match.group(1))
    }


def main() -> int:
    failures: list[str] = []

    required_files = (
        THEME,
        APP_LAYOUT,
        COMPONENTS,
        CONTROLS,
        COMPOSER,
        COMPOSER_INPUT,
        TIMELINE,
        COMMAND_PALETTE,
        EMPLOYEE_DIRECTORY,
        CONTENT_VIEW,
        CONTRACT,
        PREVIEW,
    )
    for path in required_files:
        if not path.is_file():
            failures.append(f"missing required design-system file: {path.relative_to(ROOT)}")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    theme_source = THEME.read_text(encoding="utf-8")
    app_layout_source = APP_LAYOUT.read_text(encoding="utf-8")
    component_source = COMPONENTS.read_text(encoding="utf-8")
    controls_source = CONTROLS.read_text(encoding="utf-8")
    composer_source = COMPOSER.read_text(encoding="utf-8")
    composer_input_source = COMPOSER_INPUT.read_text(encoding="utf-8")
    timeline_source = TIMELINE.read_text(encoding="utf-8")
    command_palette_source = COMMAND_PALETTE.read_text(encoding="utf-8")
    employee_directory_source = EMPLOYEE_DIRECTORY.read_text(encoding="utf-8")
    content_view_source = CONTENT_VIEW.read_text(encoding="utf-8")
    contract_source = CONTRACT.read_text(encoding="utf-8")
    preview_source = PREVIEW.read_text(encoding="utf-8")
    swift_files = list(SWIFT_ROOT.rglob("*.swift"))
    feature_source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in swift_files
        if "DesignSystem" not in path.parts
    )
    all_swift = "\n".join(path.read_text(encoding="utf-8") for path in swift_files)

    refined_typography = {
        "pageTitleSize": "22",
        "sectionTitleSize": "16",
        "workspaceTitleSize": "14",
        "navigationSize": "13",
        "sidebarTitleSize": "13",
        "interfaceBodySize": "13",
        "readingBodySize": "14",
        "assistantBodySize": "14",
        "supportingSize": "12",
        "metadataSize": "11",
        "compactMetadataSize": "10",
        "codeSize": "12",
        "metricSize": "20",
    }
    for token, value in refined_typography.items():
        marker = f"static let {token}: CGFloat = {value}"
        if marker not in theme_source:
            failures.append(f"refined typography token is missing or stale: {marker}")

    text_roles = ("ink", "body", "muted", "mutedSoft", "accentTeal", "success", "warning", "error")
    for scheme in ("light", "dark"):
        palette = palette_block(theme_source, scheme)
        required_roles = {*text_roles, "canvas", "primaryActive", "onPrimary"}
        missing_roles = sorted(required_roles.difference(palette))
        if missing_roles:
            failures.append(f"{scheme} palette roles could not be parsed: {', '.join(missing_roles)}")
            continue
        for role in text_roles:
            ratio = contrast(palette[role], palette["canvas"])
            if ratio < 4.5:
                failures.append(f"{scheme} {role}/canvas contrast {ratio:.2f}:1 is below 4.5:1")
        primary_ratio = contrast(palette["onPrimary"], palette["primaryActive"])
        if primary_ratio < 4.5:
            failures.append(f"{scheme} onPrimary/primaryActive contrast {primary_ratio:.2f}:1 is below 4.5:1")
        for role, value in palette.items():
            if role == "shadow":
                continue
            if f"#{value}" not in preview_source.upper():
                failures.append(f"component preview is missing {scheme} {role} color #{value}")

    for component in (
        "CreamSearchField",
        "CreamIconButton",
        "CreamSectionHeader",
        "CreamStatusBadge",
        "CreamStatusLabel",
        "CreamSymbol",
        "CreamFeatureIcon",
        "CreamInteractiveRow",
        "CreamTabbedDetailHeader",
        "CreamTabbedPageContainer",
    ):
        if f"struct {component}" not in component_source:
            failures.append(f"missing shared component definition: {component}")
        call_marker = component if component == "CreamTabbedPageContainer" else f"{component}("
        call_count = feature_source.count(call_marker)
        if call_count < 2:
            failures.append(f"{component} has {call_count} feature call sites; at least 2 are required")
        if component not in preview_source:
            failures.append(f"component preview is missing shared component: {component}")

    if "static let tabbedDetailContentMaxWidth: CGFloat = 820" not in app_layout_source:
        failures.append("page-level tab content track is not fixed to the shared 820pt maximum")
    tabbed_container = declaration_block(component_source, "struct CreamTabbedPageContainer")
    for description, marker in {
        "shared content width": "AppLayoutProfile.tabbedDetailContentMaxWidth",
        "adaptive horizontal inset": "horizontalInset ?? layout.horizontalInset",
        "centered outer frame": '.frame(maxWidth: .infinity, alignment: .top)',
    }.items():
        if marker not in tabbed_container:
            failures.append(f"CreamTabbedPageContainer lacks {description}: {marker}")

    pane_roles = declaration_block(component_source, "enum CreamPaneSurfaceRole")
    for role in ("globalNavigation", "collection", "tabWorkspace"):
        if f"case {role}" not in pane_roles:
            failures.append(f"CreamPaneSurfaceRole lacks shared surface role: {role}")
    pane_surface = declaration_block(component_source, "struct CreamPaneSurfaceModifier")
    for description, marker in {
        "continuous rounded clipping": ".clipShape(shape)",
        "soft theme stroke": "palette.hairlineSoft.opacity(strokeOpacity)",
        "theme shadow": ".shadow(color: palette.shadow",
        "canvas breathing room": ".background(palette.canvas)",
    }.items():
        if marker not in pane_surface:
            failures.append(f"CreamPaneSurfaceModifier lacks {description}: {marker}")
    if feature_source.count(".creamPaneSurface(.globalNavigation)") < 1:
        failures.append("global navigation does not use CreamPaneSurfaceRole.globalNavigation")
    if all_swift.count(".creamPaneSurface(.collection)") < 3:
        failures.append("shared browser layouts do not consistently use CreamPaneSurfaceRole.collection")
    if feature_source.count("showsWorkspaceSurface: true") < 4:
        failures.append("page-level tab workspaces do not consistently enable the shared workspace surface")
    for marker in ("CreamPaneSurfaceRole", "globalNavigation", "collection", "tabWorkspace"):
        if marker not in contract_source or marker not in preview_source:
            failures.append(f"pane surface contract or preview is missing: {marker}")

    content_surface = declaration_block(component_source, "struct CreamContentSurface")
    for description, marker in {
        "standard reading inset": "var contentInset: CGFloat = 20",
        "shared card fill": "palette.surfaceCard",
        "continuous extra-large radius": "AppTheme.Radius.xl",
        "soft outline": "palette.hairlineSoft",
    }.items():
        if marker not in content_surface:
            failures.append(f"CreamContentSurface lacks {description}: {marker}")
    tab_content_section = declaration_block(component_source, "struct CreamTabContentSection")
    for description, marker in {
        "semantic section header": "CreamSectionHeader(title, subtitle: subtitle)",
        "shared content surface": "CreamContentSurface",
        "Contacts-aligned vertical rhythm": "spacing: 18",
    }.items():
        if marker not in tab_content_section:
            failures.append(f"CreamTabContentSection lacks {description}: {marker}")
    if feature_source.count("CreamTabContentSection(") < 2:
        failures.append("reading-style tabs do not share CreamTabContentSection across Contacts and capability pages")
    for marker in ("CreamTabContentSection", "CreamContentSurface"):
        if marker not in contract_source or marker not in preview_source:
            failures.append(f"tab reading surface contract or preview is missing: {marker}")

    symbol = declaration_block(component_source, "struct CreamSymbol")
    for description, marker in {
        "monochrome SF Symbol rendering": ".symbolRenderingMode(.monochrome)",
        "shared icon weight": "weight: .medium",
    }.items():
        if marker not in symbol:
            failures.append(f"CreamSymbol lacks {description}: {marker}")
    for scale in ("compact", "standard", "feature", "emptyState"):
        if f"case {scale}" not in component_source:
            failures.append(f"CreamSymbol lacks semantic scale: {scale}")

    action_icon = declaration_block(component_source, "struct CreamActionIcon")
    for description, marker in {
        "shared symbol": "CreamSymbol(systemName: systemName)",
        "fixed hit target": "AppTheme.Control.hitTarget",
    }.items():
        if marker not in action_icon:
            failures.append(f"CreamActionIcon lacks {description}: {marker}")

    icon_menu = declaration_block(component_source, "struct CreamIconMenu")
    for description, marker in {
        "shared action icon": "CreamActionIcon(systemName: systemName)",
        "hidden system menu indicator": ".menuIndicator(.hidden)",
        "explicit neutral tint": ".tint(foreground)",
        "keyboard focus binding": ".focused($isFocused)",
        "theme focus stroke": "palette.focusStroke",
        "help text": ".help(help)",
        "accessibility label": ".accessibilityLabel(accessibilityLabel)",
    }.items():
        if marker not in icon_menu:
            failures.append(f"CreamIconMenu lacks {description}: {marker}")

    sidebar_button = declaration_block(controls_source, "struct CreamSidebarButtonStyle")
    for description, marker in {
        "explicit focus state": "var isFocused = false",
        "theme focus stroke": "palette.focusStroke",
    }.items():
        if marker not in sidebar_button:
            failures.append(f"CreamSidebarButtonStyle lacks {description}: {marker}")

    interactive_row = declaration_block(component_source, "struct CreamInteractiveRow")
    for description, marker in {
        "shared selection style": "CreamSidebarButtonStyle(",
        "hover state": ".onHover",
        "keyboard focus binding": ".focused($isFocused)",
        "disabled system focus ring": ".focusEffectDisabled()",
        "selected accessibility trait": ".accessibilityAddTraits(",
    }.items():
        if marker not in interactive_row:
            failures.append(f"CreamInteractiveRow lacks {description}: {marker}")

    for style_name in ("CreamPrimaryButtonStyle", "CreamSecondaryButtonStyle"):
        block = declaration_block(controls_source, f"struct {style_name}")
        for description, marker in {
            "explicit loading API": "var isLoading",
            "loading indicator": "ProgressView()",
            "keyboard focus state": "@Environment(\\.isFocused)",
            "focus stroke": "palette.focusStroke",
        }.items():
            if marker not in block:
                failures.append(f"{style_name} lacks {description}: {marker}")
        for description, marker in {
            "shared hover feedback": "CreamButtonHoverFeedback(",
            "disabled system focus ring": ".focusEffectDisabled()",
        }.items():
            if marker not in block:
                failures.append(f"{style_name} lacks {description}: {marker}")

    for style_name in ("CreamInlineButtonStyle", "CreamEmbeddedButtonStyle"):
        block = declaration_block(controls_source, f"struct {style_name}")
        for description, marker in {
            "shared hover feedback": "CreamButtonHoverFeedback(",
            "pressed scale": "AppTheme.Interaction.pressedScale",
            "disabled system focus ring": ".focusEffectDisabled()",
        }.items():
            if marker not in block:
                failures.append(f"{style_name} lacks {description}: {marker}")

    for control_name in ("CreamSegmentedControl", "CreamTabBar"):
        block = declaration_block(controls_source, f"struct {control_name}")
        for description, marker in {
            "per-item focus ownership": "@FocusState",
            "keyboard focus binding": ".focused(",
            "shared pressed/focus style": "CreamSelectionButtonStyle(",
            "selected accessibility trait": ".accessibilityAddTraits(",
        }.items():
            if marker not in block:
                failures.append(f"{control_name} lacks {description}: {marker}")

    segmented_control = declaration_block(controls_source, "struct CreamSegmentedControl")
    if "showsFocusStroke: true" not in segmented_control or ".focusEffectDisabled()" not in segmented_control:
        failures.append("CreamSegmentedControl must replace the system focus ring with the theme focus stroke")

    tab_bar = declaration_block(controls_source, "struct CreamTabBar")
    for description, marker in {
        "independent keyboard focus treatment": "else if focusedItemID == item.id",
        "visible keyboard focus underline": "fill(palette.focusStroke).frame(height: 2)",
        "disabled enclosing focus stroke": "showsFocusStroke: false",
        "disabled system focus ring": ".focusEffectDisabled()",
        "hover state": "hoveredItemID",
    }.items():
        if marker not in tab_bar:
            failures.append(f"CreamTabBar lacks {description}: {marker}")
    if ".stroke(palette.focusStroke, lineWidth: 1.5)" in tab_bar:
        failures.append("CreamTabBar must not draw a rounded focus outline around a tab")

    modal_block = declaration_block(controls_source, "struct CreamModalOverlay")
    for description, marker in {
        "Escape dismissal": ".onExitCommand(perform: close)",
        "modal focus section": ".focusSection()",
        "focus restoration bridge": "ModalFocusRestorationBridge(close: close)",
    }.items():
        if marker not in modal_block:
            failures.append(f"CreamModalOverlay lacks {description}: {marker}")

    focus_bridge = declaration_block(controls_source, "struct ModalFocusRestorationBridge")
    focus_bridge += declaration_block(controls_source, "final class ModalFocusRestorationView")
    for description, marker in {
        "AppKit representable boundary": "NSViewRepresentable",
        "previous responder capture": "NSResponder",
        "field editor normalization": "fieldEditor.isFieldEditor",
        "owning control capture": "fieldEditor.delegate as? NSResponder",
        "bounded restoration retry": "remainingAttempts: 3",
        "Escape event monitor": "NSEvent.addLocalMonitorForEvents",
        "Escape key routing": "event.keyCode == 53",
        "event monitor cleanup": "NSEvent.removeMonitor",
        "first responder restoration": "makeFirstResponder",
    }.items():
        if marker not in focus_bridge:
            failures.append(f"ModalFocusRestorationBridge lacks {description}: {marker}")
    if ".accessibilityHidden(isModalPresented)" not in content_view_source:
        failures.append("ContentView does not isolate background accessibility while a modal is open")
    for marker in (
        "@State private var isModalBackgroundDisabled",
        ".disabled(isModalBackgroundDisabled)",
        ".onChange(of: isModalPresented)",
        "DispatchQueue.main.async",
    ):
        if marker not in content_view_source:
            failures.append(f"ContentView lacks delayed modal focus isolation: {marker}")
    if ".disabled(isModalPresented)" in content_view_source:
        failures.append("ContentView disables the background before modal focus capture")

    command_search = declaration_block(command_palette_source, "struct CreamCommandPaletteSearchField")
    for description, marker in {
        "external focus binding": "@FocusState.Binding",
        "shared interface typography": "AppTheme.Typography.interfaceBody",
        "search accessibility label": ".accessibilityLabel(",
        "shared icon action": "CreamIconButton(",
    }.items():
        if marker not in command_search:
            failures.append(f"CreamCommandPaletteSearchField lacks {description}: {marker}")
    if command_palette_source.count("CreamCommandPaletteSearchField(") < 1:
        failures.append("CommandPaletteView does not use CreamCommandPaletteSearchField")
    for marker in (".onAppear", "DispatchQueue.main.async", "searchFocused = true"):
        if marker not in command_palette_source:
            failures.append(f"CommandPaletteView lacks post-presentation focus handoff: {marker}")
    for raw_type in (".font(.title3)", ".font(.caption"):
        if raw_type in command_palette_source:
            failures.append(f"CommandPaletteView still uses raw typography: {raw_type}")

    component_migrations = {
        "EmployeeDirectoryView.swift": (
            "CreamSearchField(",
            "CreamSectionHeader(",
            "CreamIconButton(",
            "CreamStatusBadge(",
            "CreamInteractiveRow(",
        ),
        "ScenarioLibraryWorkspaceView.swift": (
            "CreamSearchField(",
            "CreamSectionHeader(",
            "CreamIconButton(",
            "CreamStatusBadge(",
            "CreamInteractiveRow(",
        ),
    }
    for filename, markers in component_migrations.items():
        path = next((item for item in swift_files if item.name == filename), None)
        if path is None:
            failures.append(f"missing component migration target: {filename}")
            continue
        source = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in source:
                failures.append(f"{filename} has not migrated shared component: {marker}")

    for marker in (
        'systemName: "pencil"',
        'systemName: "bubble.left"',
        "CreamIconMenu(",
        "CreamTabbedDetailHeader(",
        "CreamInteractiveRow(",
    ):
        if marker not in employee_directory_source:
            failures.append(f"EmployeeDirectoryView lacks compact icon action or row focus behavior: {marker}")
    for obsolete_marker in ('systemName: "square.and.pencil"', 'systemName: "bubble.left.and.bubble.right"'):
        if obsolete_marker in employee_directory_source:
            failures.append(f"EmployeeDirectoryView still mixes a heavier profile action glyph: {obsolete_marker}")

    if 'Image(systemName:' in feature_source:
        failures.append("feature views still construct raw SF Symbols outside CreamSymbol")
    for raw_style in (".buttonStyle(.plain)", ".buttonStyle(.bordered)", ".buttonStyle(.borderedProminent)", ".buttonStyle(.link)"):
        if raw_style in feature_source:
            failures.append(f"feature views still use a raw button interaction style: {raw_style}")
    if re.search(r"\bList\(", feature_source):
        failures.append("feature views still use a system List instead of CreamInteractiveRow for selectable rows")

    if feature_source.count("CreamInteractiveRow(") < 10:
        failures.append("CreamInteractiveRow has not migrated the client-wide selectable row surfaces")
    if feature_source.count("CreamTabbedDetailHeader(") < 2:
        failures.append("CreamTabbedDetailHeader must be shared by Contacts and Capability detail pages")
    if feature_source.count("CreamTabbedPageContainer") < 6:
        failures.append("CreamTabbedPageContainer has not centered every page-level tab header and body")
    if feature_source.count("CreamStatusLabel(") < 5:
        failures.append("CreamStatusLabel has not migrated client-wide inline status surfaces")

    supporting_source = next(
        path.read_text(encoding="utf-8") for path in swift_files if path.name == "SupportingWorkspaces.swift"
    )
    for source_name, source in {
        "EmployeeDirectoryView.swift": employee_directory_source,
        "SupportingWorkspaces.swift": supporting_source,
    }.items():
        if "CreamTabbedDetailHeader(" not in source:
            failures.append(f"{source_name} does not use the shared tabbed detail header")

    scenario_source = next(
        path.read_text(encoding="utf-8") for path in swift_files if path.name == "ScenarioLibraryWorkspaceView.swift"
    )
    for source_name, source in {
        "EmployeeDirectoryView.swift": employee_directory_source,
        "SupportingWorkspaces.swift": supporting_source,
        "ScenarioLibraryWorkspaceView.swift": scenario_source,
    }.items():
        if "CreamTabbedPageContainer" not in source:
            failures.append(f"{source_name} does not use the shared centered tab page container")

    raw_search_field = re.compile(r'TextField\("搜索[^"\\n]*"')
    for path in swift_files:
        if "DesignSystem" in path.parts or path == COMMAND_PALETTE:
            continue
        if raw_search_field.search(path.read_text(encoding="utf-8")):
            failures.append(f"raw feature search field remains: {path.relative_to(ROOT)}")
    if employee_directory_source.count("CreamSearchField(") < 3:
        failures.append("EmployeeDirectoryView has not migrated every search surface")
    employee_editor_source = next(
        path.read_text(encoding="utf-8") for path in swift_files if path.name == "EmployeeEditorView.swift"
    )
    if "CreamPrimaryButtonStyle(isLoading: isSaving)" not in employee_editor_source:
        failures.append("EmployeeEditorView does not exercise the shared primary-button loading state")
    for marker in (
        "isCapabilityPickerBackgroundDisabled",
        ".accessibilityHidden(capabilityPicker != nil)",
        ".onChange(of: capabilityPicker)",
    ):
        if marker not in employee_editor_source:
            failures.append(f"EmployeeEditorView lacks nested modal isolation: {marker}")
    scenario_source = next(
        path.read_text(encoding="utf-8") for path in swift_files if path.name == "ScenarioLibraryWorkspaceView.swift"
    )
    for marker in (
        "isDiscardBackgroundDisabled",
        ".accessibilityHidden(showsDiscardConfirmation)",
        ".onChange(of: showsDiscardConfirmation)",
    ):
        if marker not in scenario_source:
            failures.append(f"ScenarioLibraryWorkspaceView lacks nested modal isolation: {marker}")

    if "struct CreamComposer<" not in composer_source:
        failures.append("missing shared component definition: CreamComposer")
    composer_call_count = feature_source.count("CreamComposer(")
    if composer_call_count < 3:
        failures.append(f"CreamComposer has {composer_call_count} feature call sites; at least 3 are required")
    for marker in ("CreamComposerSize", "CreamComposerActionState", "CreamComposerTextView(", ".help(actionHelp)"):
        if marker not in composer_source:
            failures.append(f"CreamComposer lacks required contract marker: {marker}")
    for marker in ("NSViewRepresentable", "hasMarkedText()", "contains(.shift)", "insertNewline(nil)"):
        if marker not in composer_input_source:
            failures.append(f"CreamComposer text input lacks required contract marker: {marker}")

    for component in (
        "CreamTimelineLayout",
        "CreamTimelineUserMessage",
        "CreamTimelineAgentRow",
        "CreamTimelineMarkdownBody",
    ):
        if f"struct {component}" not in timeline_source:
            failures.append(f"missing shared timeline component definition: {component}")
        if component not in preview_source:
            failures.append(f"component preview is missing shared timeline component: {component}")

    if "—" in preview_source or "–" in preview_source:
        failures.append("component preview contains a forbidden long dash")
    if "transition: all" in preview_source:
        failures.append("component preview uses transition: all")

    preview_typography_requirements = {
        "single refined client typography scope": ".client-preview-shell {",
        "semantic display size": "--type-display:",
        "semantic reading size": "--type-reading:",
    }
    for description, marker in preview_typography_requirements.items():
        if marker not in preview_source:
            failures.append(f"component preview lacks {description}")
    for stale_typography_control in ('data-type-choice=', "function applyTypeScale(choice)"):
        if stale_typography_control in preview_source:
            failures.append(f"component preview still exposes removed typography switching: {stale_typography_control}")

    preview_page_requirements = {
        "client page switch behavior": "function applyClientPage(choice)",
        "client page preview shell": "data-client-preview",
        "shared client navigation height": "--client-nav-height:",
        "shared client page padding": "--client-page-pad-y:",
        "shared client sidebar type": "--client-sidebar-nav-font:",
        "shared client list title type": "--client-list-title-font:",
        "shared client list metadata type": "--client-list-meta-font:",
        "shared timeline template": 'id="cream-timeline-template"',
        "shared timeline renderer": "function renderCreamTimeline(host, source)",
        "shared timeline markdown system": "cream-timeline-markdown",
        "compact timeline size variant": 'data-timeline-density="compact"',
        "regular timeline size variant": 'data-timeline-density="regular"',
        "shared client composer system": "client-shared-composer",
        "compact composer size variant": 'data-composer-size="compact"',
        "regular composer size variant": 'data-composer-size="regular"',
        "composer attachment action": 'aria-label="添加附件"',
        "composer model label": "client-composer-model",
        "timeline copy action": "data-timeline-copy",
        "work page mapping": 'data-client-panel="work"',
        "agents page mapping": 'data-client-panel="agents"',
        "skills page mapping": 'data-client-panel="skills"',
        "tools page mapping": 'data-client-panel="tools"',
        "settings page mapping": 'data-client-panel="settings"',
    }
    for description, marker in preview_page_requirements.items():
        if marker not in preview_source:
            failures.append(f"component preview lacks {description}")

    coverage_rows = re.findall(
        r'<div class="coverage-row" data-coverage-status="([^"]+)" data-component-level="([^"]+)">',
        preview_source,
    )
    if len(coverage_rows) < 10:
        failures.append("component preview coverage matrix is incomplete or not machine-readable")
    for status, level in coverage_rows:
        if status != "standardized":
            failures.append(f"component preview still reports incomplete coverage: {level}={status}")
    for marker in (
        "已完成当前范围",
        "Native Primitive",
        "Business Pattern",
        "Specialized Pattern",
        "CreamCommandPaletteSearchField",
    ):
        if marker not in preview_source:
            failures.append(f"component preview coverage matrix lacks: {marker}")
    if "仍在迁移" in preview_source:
        failures.append("component preview still uses the stale summary: 仍在迁移")

    for forbidden in ("AppTheme.Motion.fast", "AppTheme.Motion.standard", "AppTheme.Motion.emphasized"):
        if forbidden in all_swift:
            failures.append(f"legacy motion token remains: {forbidden}")

    for retired_hex in ("0x9F6819", "0x8D8575", "0x8C887E"):
        if retired_hex in all_swift:
            failures.append(f"retired Claude Cream color remains: {retired_hex}")

    raw_animation = re.compile(r"\.(?:easeIn|easeOut|easeInOut|linear)\(duration:\s*[0-9]")
    for path in swift_files:
        if path == THEME:
            continue
        if raw_animation.search(path.read_text(encoding="utf-8")):
            failures.append(f"raw animation duration outside AppTheme: {path.relative_to(ROOT)}")

    raw_business_color = re.compile(
        r"(?:Color\.)?\.(?:red|blue|green|orange|purple)\b|Color\.(?:red|blue|green|orange|purple)\b"
    )
    for path in swift_files:
        if "Views" not in path.parts:
            continue
        if raw_business_color.search(path.read_text(encoding="utf-8")):
            failures.append(f"raw business color in feature view: {path.relative_to(ROOT)}")

    component_requirements = {
        "Reduce Motion support": "accessibilityReduceMotion",
        "keyboard focus support": "@FocusState",
        "icon button Help": ".help(help)",
        "icon button accessibility label": ".accessibilityLabel(accessibilityLabel)",
        "client-wide hover contract": "CreamInteractiveRow",
        "shared SF Symbol grammar": "CreamSymbol",
    }
    for description, marker in component_requirements.items():
        if marker not in component_source:
            failures.append(f"shared component library lacks {description}")

    if failures:
        print("ui design system checks failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("ui design system checks: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
