#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This spike requires macOS Keychain Services."
  exit 2
fi

script_dir="${0:A:h}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-employee-os-stable-signing-spike.XXXXXX")"
keychain_path="$work_dir/spike.keychain-db"
reader_path="$work_dir/provider-reader"
replacement_path="$work_dir/provider-reader-next"
negative_path="$work_dir/provider-reader-negative"
service="com.kakarrot.ai-employee-os.phase0.stable-signing-spike"
account="phase0-fixture"
keychain_password="phase0-temporary-keychain-only"
fixture_secret="phase0-temporary-secret-not-a-user-credential"
signing_identity="${AI_EMPLOYEE_OS_LOCAL_SIGNING_IDENTITY:-AI Employee OS Local Development}"

cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

if ! security find-identity -v -p codesigning | grep -Fq "\"$signing_identity\""; then
  print -u2 "stable signing identity not found: $signing_identity"
  exit 3
fi

compile_reader() {
  local output_path="$1"
  local variant="$2"
  xcrun clang \
    -std=c11 \
    -Wall \
    -Wextra \
    -Werror \
    -Wno-deprecated-declarations \
    -DREADER_VARIANT="$variant" \
    -framework CoreFoundation \
    -framework Security \
    "$script_dir/keychain_reader.c" \
    -o "$output_path"
}

compile_reader "$reader_path" 1
codesign --force --sign "$signing_identity" --identifier com.kakarrot.ai-employee-os.phase0.provider-reader "$reader_path" >/dev/null

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 3600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security add-generic-password \
  -a "$account" \
  -s "$service" \
  -T "$reader_path" \
  -w "$fixture_secret" \
  "$keychain_path"

initial_result="$($reader_path "$keychain_path" "$service" "$account")"
if [[ "$initial_result" != "read_ok bytes=${#fixture_secret} variant=1" ]]; then
  print -u2 "initial_signed_reader_unexpected result=$initial_result"
  exit 4
fi

compile_reader "$replacement_path" 2
codesign --force --sign "$signing_identity" --identifier com.kakarrot.ai-employee-os.phase0.provider-reader "$replacement_path" >/dev/null
mv "$replacement_path" "$reader_path"

upgrade_result="$($reader_path "$keychain_path" "$service" "$account")"
if [[ "$upgrade_result" != "read_ok bytes=${#fixture_secret} variant=2" ]]; then
  print -u2 "same_identity_upgrade_unexpected result=$upgrade_result"
  exit 5
fi

compile_reader "$negative_path" 3
codesign --force --sign - --identifier com.kakarrot.ai-employee-os.phase0.provider-reader "$negative_path" >/dev/null
mv "$negative_path" "$reader_path"

set +e
negative_result="$($reader_path "$keychain_path" "$service" "$account" 2>&1)"
negative_status=$?
set -e
if (( negative_status == 0 )); then
  print -u2 "changed_signing_chain_was_allowed result=$negative_result"
  exit 6
fi

print '{'
print '  "temporary_keychain_only": true,'
print '  "secret_value_printed": false,'
print '  "stable_local_identity_present": true,'
print '  "initial_signed_reader": "passed_without_interaction",'
print '  "same_identity_changed_binary": "passed_without_interaction",'
print '  "changed_signing_chain": "denied_without_interaction",'
print '  "apple_profile_boundary": "local_identity_evidence_only_not_a_provisioning_profile"'
print '}'
