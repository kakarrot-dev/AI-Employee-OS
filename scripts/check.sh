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
python3 scripts/check_product_language.py
python3 scripts/check_office_motion.py
python3 scripts/check_ui_design_system.py
python3 scripts/check_composer_reuse.py
python3 scripts/check_timeline_reuse.py
python3 scripts/check_signing_identity.py
python3 scripts/check_employee_runtime.py
python3 scripts/check_generic_runtime.py
python3 scripts/check_business_flow_runtime.py
python3 scripts/check_business_flow_ui.py
python3 scripts/check_task_room_ui.py
python3 scripts/check_adaptive_layout.py
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
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/AppLayout.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/EmployeePresentation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/MarkdownBlock.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/TaskPresentation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Support/ToolPresentation.swift \
  apps/macos/AIEmployee/Tests/ClientModelChecks.swift \
  -o "$CLIENT_CHECK_BINARY"
"$CLIENT_CHECK_BINARY"

TASK_STORE_CHECK_BINARY="${TMPDIR:-/tmp}/ai-employee-task-store-checks"
TASK_STORE_CLANG_CACHE="${TMPDIR:-/tmp}/ai-employee-task-store-clang-cache"
TASK_STORE_SWIFT_CACHE="${TMPDIR:-/tmp}/ai-employee-task-store-swift-cache"
mkdir -p "$TASK_STORE_CLANG_CACHE" "$TASK_STORE_SWIFT_CACHE"
CLANG_MODULE_CACHE_PATH="$TASK_STORE_CLANG_CACHE" \
SWIFT_MODULECACHE_PATH="$TASK_STORE_SWIFT_CACHE" \
swiftc \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskRun.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Employee.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Conversation.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/OfficeSnapshot.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/RuntimeCapabilities.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Scenario.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/WorkLibraryDemoData.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/ModelConfiguration.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/Knowledge.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift \
  apps/macos/AIEmployee/Tests/TaskProposalRecoveryChecks.swift \
  -o "$TASK_STORE_CHECK_BINARY"
"$TASK_STORE_CHECK_BINARY"
