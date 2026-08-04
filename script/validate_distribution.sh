#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/dist/AIEmployee.app"

test -x "$APP_BUNDLE/Contents/MacOS/AIEmployee"
test -x "$APP_BUNDLE/Contents/MacOS/ai-employee-runtime"
test -f "$APP_BUNDLE/Contents/Resources/AIEmployeeRuntime/runtime/python-agent/app/worker.py"
test -f "$APP_BUNDLE/Contents/Resources/AIEmployeeRuntime/packages/agents/ai-product-manager/manifest.yaml"
test -f "$APP_BUNDLE/Contents/Resources/AIEmployeeRuntime/packages/skills/prd-generation/manifest.yaml"
test -f "$APP_BUNDLE/Contents/Resources/AIEmployeeRuntime/packages/tools/document-tool/manifest.yaml"
test -z "$(find "$APP_BUNDLE" \( -name '__pycache__' -o -name '*.pyc' \) -print -quit)"
plutil -lint "$APP_BUNDLE/Contents/Info.plist"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
codesign --verify --strict --verbose=2 "$APP_BUNDLE/Contents/MacOS/ai-employee-runtime"
codesign -d --entitlements :- "$APP_BUNDLE" >/dev/null

if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  codesign --force --deep --options runtime --timestamp --sign "$DEVELOPER_ID_APPLICATION" "$APP_BUNDLE"
  codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
fi

echo "distribution bundle validation: ok"
