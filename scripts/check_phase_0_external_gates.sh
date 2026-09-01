#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

has_identity() {
  security find-identity -v -p codesigning 2>/dev/null | grep -Fq "\"$1\""
}

has_identity_prefix() {
  security find-identity -v -p codesigning 2>/dev/null | grep -Fq "\"$1"
}

if has_identity "AI Employee OS Local Development"; then
  local_signing=true
else
  local_signing=false
fi

if has_identity_prefix "Apple Development:"; then
  apple_development=true
else
  apple_development=false
fi

if has_identity_prefix "Developer ID Application:"; then
  developer_id=true
else
  developer_id=false
fi

profile_output=$(profiles list -type provisioning 2>&1 || true)
if [ -n "$profile_output" ] && ! printf '%s\n' "$profile_output" | grep -Fq 'No provisioning profiles appear to be installed.'; then
  provisioning_profile=true
else
  provisioning_profile=false
fi

if security find-generic-password -s com.kakarrot.ai-employee-os.credentials.v2 >/dev/null 2>&1; then
  credential_container=true
else
  credential_container=false
fi

if [ -f "$project_dir/docs/audits/phase-0/evidence/deepseek-responses-v4-pro-2026-08-31.json" ]; then
  real_provider_evidence=true
else
  real_provider_evidence=false
fi

if [ "$local_signing" = true ] && [ "$real_provider_evidence" = true ]; then
  local_phase_0_ready=true
else
  local_phase_0_ready=false
fi

if [ "$apple_development" = true ] && [ "$developer_id" = true ] && [ "$provisioning_profile" = true ]; then
  apple_release_materials_ready=true
else
  apple_release_materials_ready=false
fi

cat <<EOF
{
  "stable_local_signing_identity": $local_signing,
  "apple_development_identity": $apple_development,
  "developer_id_application_identity": $developer_id,
  "provisioning_profile_installed": $provisioning_profile,
  "existing_product_credential_container": $credential_container,
  "credential_value_read": false,
  "real_provider_probe_evidence": $real_provider_evidence,
  "local_phase_0_ready": $local_phase_0_ready,
  "apple_release_materials_ready": $apple_release_materials_ready,
  "apple_release_gate_phase": 9
}
EOF
