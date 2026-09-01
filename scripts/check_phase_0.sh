#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

run_check() {
  label=$1
  shift
  echo "[phase-0] $label"
  if "$@"; then
    return 0
  else
    status=$?
  fi
  echo "[phase-0] failed: $label (exit $status)" >&2
  failures=$((failures + 1))
  return 0
}

failures=0

require_command python3
require_command uv
require_command clang
require_command codesign
require_command security

run_check "provider isolation" python3 spikes/provider-proxy/provider_proxy_spike.py
run_check "managed research" python3 spikes/managed-research/managed_research_spike.py
run_check "temporary Keychain ACL" ./spikes/macos-process-security/run_keychain_acl_spike.sh
run_check "stable local signing upgrade" ./spikes/macos-process-security/run_stable_signing_upgrade_spike.sh
run_check "network failure model" ./spikes/macos-process-security/run_network_sandbox_spike.sh

echo "[phase-0] Deep Agents locked environment"
if uv sync --frozen --project spikes/deep-agents; then
  run_check "Deep Agents orchestration" uv run --frozen --no-sync --project spikes/deep-agents python spikes/deep-agents/orchestration_spike.py
  run_check "Deep Agents hard cancel" uv run --frozen --no-sync --project spikes/deep-agents python spikes/deep-agents/hard_cancel_spike.py
else
  status=$?
  echo "[phase-0] failed: Deep Agents locked environment (exit $status)" >&2
  failures=$((failures + 1))
fi

echo "[phase-0] local memory locked environment"
if uv sync --frozen --project spikes/local-memory; then
  run_check "local memory" uv run --frozen --no-sync --project spikes/local-memory python spikes/local-memory/local_memory_spike.py
else
  status=$?
  echo "[phase-0] failed: local memory locked environment (exit $status)" >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "[phase-0] deterministic checks failed: $failures" >&2
  exit 1
fi

echo "[phase-0] deterministic checks passed"
echo "[phase-0] external gates are separate: real Provider probe and Apple-signed package matrix"
