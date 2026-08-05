#!/usr/bin/env bash
set -euo pipefail

cargo fmt --all --check
cargo test --workspace
cargo build --bin tool-gateway
python3 scripts/check_contracts.py
PYTHONPATH=runtime/python-agent python3 -m unittest discover -s runtime/python-agent -p 'test_*.py'
CLIENT_CHECK_BINARY="${TMPDIR:-/tmp}/ai-employee-client-model-checks"
swiftc \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskRun.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/EmployeePresentation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/MarkdownBlock.swift \
  apps/macos/AIEmployee/Tests/ClientModelChecks.swift \
  -o "$CLIENT_CHECK_BINARY"
"$CLIENT_CHECK_BINARY"
