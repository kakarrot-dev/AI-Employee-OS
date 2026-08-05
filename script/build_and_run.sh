#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_ARGS=()
if [[ "$MODE" == "--ui-demo" ]]; then
  MODE="run"
  APP_ARGS=("--ui-demo" "${2:-office}")
fi
APP_NAME="AIEmployee"
BUNDLE_ID="com.kakarrot.ai-employee-os"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/apps/macos/AIEmployee"
APP_BUNDLE="$ROOT_DIR/dist/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/$APP_NAME"
RUNTIME_BINARY="$APP_CONTENTS/MacOS/ai-employee-runtime"
RUNTIME_RESOURCES="$APP_CONTENTS/Resources/AIEmployeeRuntime"
SIGNING_IDENTITY_NAME="${AI_EMPLOYEE_SIGNING_IDENTITY:-AI Employee OS Local Development}"

if [[ -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi

SIGNING_IDENTITY="$({ /usr/bin/security find-identity -v -p codesigning 2>/dev/null || true; } \
  | /usr/bin/awk -v name="$SIGNING_IDENTITY_NAME" 'index($0, "\"" name "\"") { print $2; exit }')"
if [[ -z "$SIGNING_IDENTITY" ]]; then
  echo "缺少稳定的本地代码签名身份：$SIGNING_IDENTITY_NAME" >&2
  echo "请先运行：$ROOT_DIR/scripts/setup_local_signing_identity.sh" >&2
  exit 1
fi

pkill -x "$APP_NAME" >/dev/null 2>&1 || true
mkdir -p "$ROOT_DIR/storage/database" "$ROOT_DIR/outputs"
cargo build --manifest-path "$ROOT_DIR/Cargo.toml" -p ai-employee-runtime
swift build --package-path "$PACKAGE_DIR"
BUILD_BINARY="$(swift build --package-path "$PACKAGE_DIR" --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_CONTENTS/MacOS"
cp "$BUILD_BINARY" "$APP_BINARY"
cp "$ROOT_DIR/target/debug/ai-employee-runtime" "$RUNTIME_BINARY"
mkdir -p "$RUNTIME_RESOURCES/runtime" "$RUNTIME_RESOURCES/packages/agents"
rsync -a --exclude '__pycache__' --exclude '*.pyc' "$ROOT_DIR/runtime/python-agent/" "$RUNTIME_RESOURCES/runtime/python-agent/"
cp -R "$ROOT_DIR/packages/agents/ai-product-manager" "$RUNTIME_RESOURCES/packages/agents/ai-product-manager"
chmod +x "$APP_BINARY"
chmod +x "$RUNTIME_BINARY"
sed -e "s/__APP_NAME__/$APP_NAME/g" -e "s/__BUNDLE_ID__/$BUNDLE_ID/g" \
  "$ROOT_DIR/apps/macos/AIEmployee/Resources/Info.plist.template" > "$APP_CONTENTS/Info.plist"
/usr/bin/codesign --force --sign "$SIGNING_IDENTITY" --options runtime "$RUNTIME_BINARY"
/usr/bin/codesign --force --sign "$SIGNING_IDENTITY" --options runtime --entitlements \
  "$ROOT_DIR/apps/macos/AIEmployee/Resources/AIEmployee.entitlements" "$APP_BUNDLE"

open_app() {
  if [[ ${#APP_ARGS[@]} -gt 0 ]]; then
    /usr/bin/open -n "$APP_BUNDLE" --args "${APP_ARGS[@]}"
  else
    /usr/bin/open -n "$APP_BUNDLE"
  fi
}

case "$MODE" in
  run) open_app ;;
  --debug|debug) lldb -- "$APP_BINARY" ;;
  --logs|logs) open_app; /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\"" ;;
  --telemetry|telemetry) open_app; /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\"" ;;
  --verify|verify) open_app; sleep 1; pgrep -x "$APP_NAME" >/dev/null; codesign --verify --deep --strict "$APP_BUNDLE" ;;
  *) echo "usage: $0 [run|--debug|--logs|--telemetry|--verify|--ui-demo office[:scene]]" >&2; exit 2 ;;
esac
