#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="AIEmployee"
BUNDLE_ID="com.kakarrot.ai-employee-os"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/apps/macos/AIEmployee"
APP_BUNDLE="$ROOT_DIR/dist/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/$APP_NAME"

if [[ -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi

pkill -x "$APP_NAME" >/dev/null 2>&1 || true
mkdir -p "$ROOT_DIR/storage/database" "$ROOT_DIR/outputs"
cargo build --manifest-path "$ROOT_DIR/Cargo.toml" -p ai-employee-runtime
swift build --package-path "$PACKAGE_DIR"
BUILD_BINARY="$(swift build --package-path "$PACKAGE_DIR" --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_CONTENTS/MacOS"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"
sed -e "s/__APP_NAME__/$APP_NAME/g" -e "s/__BUNDLE_ID__/$BUNDLE_ID/g" \
  "$ROOT_DIR/apps/macos/AIEmployee/Resources/Info.plist.template" > "$APP_CONTENTS/Info.plist"
codesign --force --sign - --options runtime --entitlements \
  "$ROOT_DIR/apps/macos/AIEmployee/Resources/AIEmployee.entitlements" "$APP_BUNDLE"

open_app() { AI_EMPLOYEE_OS_ROOT="$ROOT_DIR" /usr/bin/open -n "$APP_BUNDLE"; }

case "$MODE" in
  run) open_app ;;
  --debug|debug) lldb -- "$APP_BINARY" ;;
  --logs|logs) open_app; /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\"" ;;
  --telemetry|telemetry) open_app; /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\"" ;;
  --verify|verify) open_app; sleep 1; pgrep -x "$APP_NAME" >/dev/null; codesign --verify --deep --strict "$APP_BUNDLE" ;;
  *) echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2; exit 2 ;;
esac
