#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This spike requires macOS."
  exit 2
fi

required_variables=(
  AI_EMPLOYEE_OS_SIGNING_IDENTITY
  AI_EMPLOYEE_OS_TEAM_ID
  AI_EMPLOYEE_OS_PROVIDER_PROFILE
  AI_EMPLOYEE_OS_RUNTIME_PROFILE
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${(P)variable_name:-}" ]]; then
    print -u2 "missing required variable: $variable_name"
    exit 3
  fi
done

signing_identity="$AI_EMPLOYEE_OS_SIGNING_IDENTITY"
team_id="$AI_EMPLOYEE_OS_TEAM_ID"
provider_profile="$AI_EMPLOYEE_OS_PROVIDER_PROFILE"
runtime_profile="$AI_EMPLOYEE_OS_RUNTIME_PROFILE"
provider_bundle_id="com.kakarrot.ai-employee-os.phase0.provider"
runtime_bundle_id="com.kakarrot.ai-employee-os.phase0.runtime"
provider_group="$team_id.com.kakarrot.ai-employee-os.provider-secrets"
service="com.kakarrot.ai-employee-os.phase0.apple-profile-spike"
account="phase0-fixture"
script_dir="${0:A:h}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-employee-os-apple-profile-spike.XXXXXX")"

cleanup() {
  rm -r -- "$work_dir"
}
trap cleanup EXIT INT TERM

if [[ "$signing_identity" != "Apple Development:"* && "$signing_identity" != "Developer ID Application:"* ]]; then
  print -u2 "signing identity must be Apple Development or Developer ID Application"
  exit 4
fi
if ! security find-identity -v -p codesigning | grep -Fq "\"$signing_identity\""; then
  print -u2 "signing identity not found: $signing_identity"
  exit 5
fi
for profile_path in "$provider_profile" "$runtime_profile"; do
  if [[ ! -f "$profile_path" ]]; then
    print -u2 "provisioning profile not found: $profile_path"
    exit 6
  fi
  profiles validate -type provisioning -path "$profile_path" >/dev/null
done

decode_profile() {
  local source_path="$1"
  local destination_path="$2"
  security cms -D -i "$source_path" > "$destination_path"
  plutil -lint "$destination_path" >/dev/null
}

provider_profile_plist="$work_dir/provider-profile.plist"
runtime_profile_plist="$work_dir/runtime-profile.plist"
decode_profile "$provider_profile" "$provider_profile_plist"
decode_profile "$runtime_profile" "$runtime_profile_plist"

profile_contains_array_value() {
  local plist_path="$1"
  local key_path="$2"
  local expected="$3"
  /usr/libexec/PlistBuddy -c "Print :$key_path" "$plist_path" 2>/dev/null | grep -Fxq "    $expected"
}

if ! profile_contains_array_value "$provider_profile_plist" "TeamIdentifier" "$team_id"; then
  print -u2 "provider profile TeamIdentifier mismatch"
  exit 7
fi
if ! profile_contains_array_value "$runtime_profile_plist" "TeamIdentifier" "$team_id"; then
  print -u2 "runtime profile TeamIdentifier mismatch"
  exit 8
fi
if ! profile_contains_array_value "$provider_profile_plist" "Entitlements:keychain-access-groups" "$provider_group"; then
  print -u2 "provider profile does not grant the exact provider access group"
  exit 9
fi
if profile_contains_array_value "$runtime_profile_plist" "Entitlements:keychain-access-groups" "$provider_group"; then
  print -u2 "runtime profile unexpectedly grants the provider access group"
  exit 10
fi

create_entitlements() {
  local destination_path="$1"
  local bundle_id="$2"
  local include_provider_group="$3"
  plutil -create xml1 "$destination_path"
  /usr/libexec/PlistBuddy -c "Add :com.apple.security.app-sandbox bool true" "$destination_path"
  /usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string $team_id" "$destination_path"
  /usr/libexec/PlistBuddy -c "Add :com.apple.application-identifier string $team_id.$bundle_id" "$destination_path"
  if [[ "$include_provider_group" == "true" ]]; then
    /usr/libexec/PlistBuddy -c "Add :keychain-access-groups array" "$destination_path"
    /usr/libexec/PlistBuddy -c "Add :keychain-access-groups:0 string $provider_group" "$destination_path"
    /usr/libexec/PlistBuddy -c "Add :com.apple.security.network.client bool true" "$destination_path"
  fi
}

create_bundle() {
  local bundle_path="$1"
  local bundle_id="$2"
  local profile_path="$3"
  local entitlements_path="$4"
  local variant="$5"
  mkdir -p "$bundle_path/Contents/MacOS"
  plutil -create xml1 "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $bundle_id" "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleName string AIEmployeeOSPhase0Security" "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string phase0-security" "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 0.0.$variant" "$bundle_path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $variant" "$bundle_path/Contents/Info.plist"
  cp "$profile_path" "$bundle_path/Contents/embedded.provisionprofile"
  xcrun clang \
    -std=c11 \
    -Wall \
    -Wextra \
    -Werror \
    -DPROBE_VARIANT="$variant" \
    -framework CoreFoundation \
    -framework Security \
    "$script_dir/data_protection_keychain_probe.c" \
    -o "$bundle_path/Contents/MacOS/phase0-security"

  local sign_arguments=(--force --sign "$signing_identity" --entitlements "$entitlements_path")
  if [[ "$signing_identity" == "Developer ID Application:"* ]]; then
    sign_arguments+=(--options runtime --timestamp)
  fi
  codesign "${sign_arguments[@]}" "$bundle_path"
  codesign --verify --deep --strict --verbose=2 "$bundle_path"
}

provider_entitlements="$work_dir/provider.entitlements"
runtime_entitlements="$work_dir/runtime.entitlements"
create_entitlements "$provider_entitlements" "$provider_bundle_id" true
create_entitlements "$runtime_entitlements" "$runtime_bundle_id" false

provider_n="$work_dir/Provider-N.app"
provider_next="$work_dir/Provider-N-Plus-1.app"
runtime_negative="$work_dir/Runtime-Negative.app"
create_bundle "$provider_n" "$provider_bundle_id" "$provider_profile" "$provider_entitlements" 1
create_bundle "$provider_next" "$provider_bundle_id" "$provider_profile" "$provider_entitlements" 2
create_bundle "$runtime_negative" "$runtime_bundle_id" "$runtime_profile" "$runtime_entitlements" 3

provider_n_executable="$provider_n/Contents/MacOS/phase0-security"
provider_next_executable="$provider_next/Contents/MacOS/phase0-security"
runtime_executable="$runtime_negative/Contents/MacOS/phase0-security"

put_result="$($provider_n_executable put "$provider_group" "$service" "$account")"
if [[ "$put_result" != "put_ok bytes=50 variant=1" ]]; then
  print -u2 "provider N put failed: $put_result"
  exit 11
fi
read_result="$($provider_next_executable read "$provider_group" "$service" "$account")"
if [[ "$read_result" != "read_ok bytes=50 variant=2" ]]; then
  print -u2 "provider N+1 read failed: $read_result"
  exit 12
fi

set +e
negative_result="$($runtime_executable read "$provider_group" "$service" "$account" 2>&1)"
negative_status=$?
set -e
if (( negative_status == 0 )); then
  print -u2 "runtime negative unexpectedly read provider item: $negative_result"
  exit 13
fi

delete_result="$($provider_next_executable delete "$provider_group" "$service" "$account")"
if [[ "$delete_result" != "delete_ok variant=2" ]]; then
  print -u2 "provider cleanup failed: $delete_result"
  exit 14
fi

if print -r -- "$put_result$read_result$negative_result$delete_result" | grep -Fq "phase0-apple-profile-fixture-not-a-user-credential"; then
  print -u2 "fixture secret was printed"
  exit 15
fi

print '{'
print '  "apple_signing_identity": true,'
print '  "provider_profile_exact_group": true,'
print '  "runtime_profile_excludes_provider_group": true,'
print '  "provider_n_put": "passed",'
print '  "provider_n_plus_1_read": "passed",'
print '  "runtime_negative_read": "denied",'
print '  "fixture_secret_printed": false,'
print '  "cleanup": "passed"'
print '}'
