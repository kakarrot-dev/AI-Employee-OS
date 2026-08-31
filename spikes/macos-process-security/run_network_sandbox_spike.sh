#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This spike requires macOS App Sandbox."
  exit 2
fi

script_dir="${0:A:h}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-employee-os-network-spike.XXXXXX")"
probe="$work_dir/network-probe"
port_file="$work_dir/port"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

xcrun clang \
  -std=c11 \
  -Wall \
  -Wextra \
  -Werror \
  "$script_dir/network_probe.c" \
  -o "$probe"
plutil -lint "$script_dir/entitlements/no-network.plist" >/dev/null
plutil -lint "$script_dir/entitlements/network-client.plist" >/dev/null

"$probe" server "$port_file" &
server_pid=$!
for _ in {1..100}; do
  [[ -s "$port_file" ]] && break
  sleep 0.02
done
if [[ ! -s "$port_file" ]]; then
  print -u2 "server_did_not_publish_port"
  exit 3
fi
port="$(<"$port_file")"

set +e
blocked_result="$(sandbox-exec \
  -p '(version 1) (allow default) (deny network*)' \
  "$probe" client "$port" 2>&1)"
blocked_status=$?
set -e
if (( blocked_status == 0 )); then
  print -u2 "deprecated_sandbox_probe_connected result=$blocked_result"
  exit 4
fi

allowed_result="$($probe client "$port" 2>&1)"
if [[ "$allowed_result" != "connect_ok" ]]; then
  print -u2 "unsandboxed_control_failed result=$allowed_result"
  exit 5
fi

wait "$server_pid"
server_pid=""

print '{'
print '  "temporary_loopback_server_only": true,'
print '  "deprecated_sandbox_exec_network_deny": "passed_evidence_only",'
print '  "app_sandbox_entitlement_plists": "syntax_valid_runtime_unverified",'
print '  "destination_allowlist_proven": false,'
print '  "production_signed_bundle_required": true,'
print '  "production_decision": "do_not_use_sandbox_exec_worker_no_network_provider_and_runner_explicit_network_client"'
print '}'
