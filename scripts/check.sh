#!/usr/bin/env bash
set -euo pipefail

cargo fmt --all --check
cargo test --workspace
cargo build --bin tool-gateway
cargo build --bin ai-employee-runtime
python3 scripts/check_contracts.py
python3 scripts/check_skill_evals.py
python3 scripts/check_keychain_boundaries.py
python3 scripts/check_chat_feedback.py
python3 scripts/check_office_motion.py
python3 scripts/check_signing_identity.py
python3 scripts/check_employee_runtime.py
python3 scripts/check_generic_runtime.py
python3 scripts/check_business_flow_runtime.py
python3 scripts/check_business_flow_ui.py
PYTHONPATH=runtime/python-agent python3 -m unittest discover -s runtime/python-agent -p 'test_*.py'
CLIENT_CHECK_BINARY="${TMPDIR:-/tmp}/ai-employee-client-model-checks"
swiftc \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskRun.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Employee.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Conversation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/OfficeSnapshot.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/AppDestination.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/RuntimeCapabilities.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Scenario.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/EmployeePresentation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/MarkdownBlock.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/TaskPresentation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/ToolPresentation.swift \
  apps/macos/AIEmployee/Tests/ClientModelChecks.swift \
  -o "$CLIENT_CHECK_BINARY"
"$CLIENT_CHECK_BINARY"
