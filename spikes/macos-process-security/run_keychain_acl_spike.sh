#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This spike requires macOS Keychain Services."
  exit 2
fi

script_dir="${0:A:h}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-employee-os-keychain-spike.XXXXXX")"
keychain_path="$work_dir/spike.keychain-db"
trusted_reader="$work_dir/trusted-reader"
untrusted_reader="$work_dir/untrusted-reader"
replacement_reader="$work_dir/replacement-reader"
service="com.kakarrot.ai-employee-os.phase0.keychain-spike"
account="phase0-fixture"
keychain_password="phase0-temporary-keychain-only"
fixture_secret="phase0-temporary-secret-not-a-user-credential"

cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

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
  codesign --force --sign - "$output_path" >/dev/null
}

compile_reader "$trusted_reader" 1
compile_reader "$untrusted_reader" 2

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 3600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security add-generic-password \
  -a "$account" \
  -s "$service" \
  -T "$trusted_reader" \
  -w "$fixture_secret" \
  "$keychain_path"

trusted_result="$($trusted_reader "$keychain_path" "$service" "$account")"
if [[ "$trusted_result" != "read_ok bytes=${#fixture_secret} variant=1" ]]; then
  print -u2 "trusted_reader_unexpected result=$trusted_result"
  exit 3
fi

set +e
untrusted_result="$($untrusted_reader "$keychain_path" "$service" "$account" 2>&1)"
untrusted_status=$?
set -e
if (( untrusted_status == 0 )); then
  print -u2 "untrusted_reader_was_allowed result=$untrusted_result"
  exit 4
fi

compile_reader "$replacement_reader" 3
mv "$replacement_reader" "$trusted_reader"

set +e
replacement_result="$($trusted_reader "$keychain_path" "$service" "$account" 2>&1)"
replacement_status=$?
set -e
if (( replacement_status == 0 )); then
  print -u2 "replacement_reader_was_allowed result=$replacement_result"
  exit 5
fi

print '{'
print '  "temporary_keychain_only": true,'
print '  "secret_value_printed": false,'
print '  "trusted_signed_reader": "passed_without_interaction",'
print '  "different_signed_reader": "denied_without_interaction",'
print '  "same_path_changed_signature": "denied_without_interaction",'
print '  "legacy_acl_production_decision": "test_evidence_only_use_keychain_access_group"'
print '}'
