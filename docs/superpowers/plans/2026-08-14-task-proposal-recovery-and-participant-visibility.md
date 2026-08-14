# Task Proposal Recovery and Participant Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让确认前中断的 Task Thread 能恢复或重新生成 Proposal，并在工作库清楚显示模型匹配到的员工、岗位和分工。

**Architecture:** Rust Runtime 继续拥有 Proposal、员工匹配、错误和 revision 的唯一事实。客户端通过只读 `task-proposal-current` 恢复当前 Proposal，通过显式 `task-proposal-regenerate` 重试；Swift 只维护当前 Thread 的展示状态，并把候选员工与确认后的正式参与员工分开呈现。

**Tech Stack:** Rust、rusqlite、serde_json、Swift 5.10、SwiftUI、Python UI source gates、SQLite、macOS 14+

## Global Constraints

- 用户可见内容使用简体中文；协议字段、错误码与代码标识符使用英文。
- Runtime、SQLite 与现有 `task_proposals`、`task_thread_messages`、`task_thread_task_bindings` 是唯一事实源。
- 不修改已发布 Migration，不新增 Proposal 表，不在 Swift 中决定员工。
- 确认前只称「方案匹配」或「候选员工」；确认后才称「参与员工」。
- App 恢复、Thread 选择和启动不得自动调用模型；重新生成只能由用户显式触发。
- 不把 provider 原始正文、stderr、Prompt、API Key、Secret、完整 ToolResult 或本机路径写入错误消息。
- 不增加员工手工多选器、Scenario Builder、自由群聊、并行调度或递归委派。
- 每个生产代码任务遵循红、绿、重构；先观察失败测试，再写最小实现。
- 只暂存任务明确涉及的路径，不使用 `git add .`。

---

## File Map

**生产文件**

- Modify: `runtime/rust-core/src/main.rs`，提供 current、regenerate、失败持久化与安全错误裁剪。
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`，暴露两个新 Runtime 调用并统一用户可读错误。
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift`，定义 Proposal 展示状态和候选员工映射所需的纯值类型。
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift`，恢复、重试、选择隔离和确认前状态流转。
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift`，显示恢复卡、生成进度、候选员工与清晰标题。
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift`，向工作库注入 `EmployeeStore`。

**测试与门禁**

- Modify: `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`，验证纯状态映射和候选员工身份解析。
- Modify: `scripts/check_task_room_ui.py`，验证恢复入口、候选员工和窄窗口可见性。
- No change: `scripts/check.sh`，所有新值类型保留在它已经编译的 `TaskThread.swift` 中。

---

### Task 1: Add a read-only current Proposal contract

**Files:**

- Modify: `runtime/rust-core/src/main.rs:40-110`
- Modify: `runtime/rust-core/src/main.rs:847-1180`
- Test: `runtime/rust-core/src/main.rs:4477-end`

**Interfaces:**

- Consumes: `task_proposals(thread_id, revision, status, proposal_json, proposal_sha256, expires_at)` and `resolve_task_assignment(&Connection, &Value)`.
- Produces: `fn task_proposal_current(arguments: impl Iterator<Item = String>) -> Result<Value, String>`.
- Produces errors: `task_proposal_not_found`, `task_proposal_expired`, `task_proposal_stale`.
- Guarantee: the function performs no `INSERT`, `UPDATE`, model call, Task materialization or Tool execution.

- [ ] **Step 1: Add a failing Rust test for restart recovery**

Add a test that inserts an active Thread and a `validated` Proposal fixture, then calls the missing command function twice and verifies identical JSON and unchanged SQLite rows:

Add these test-only helpers in the same Rust test module before the test:

```rust
fn future_expiry() -> String {
    (SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() + 900).to_string()
}

fn proposal_current_arguments(database: &Path, thread_id: &str) -> impl Iterator<Item = String> {
    vec![
        "--database".to_owned(), database.display().to_string(),
        "--thread-id".to_owned(), thread_id.to_owned(),
    ].into_iter()
}
```

`proposal_recovery_fixture(status, expires_at)` returns `(database, thread_id, proposal_id)`. Its body must create a temporary database, run `migrate`, bootstrap repository packages, insert one active `data-researcher`, bind its real ready `web-search` Skill, create one Thread with a goal plus one clarification, and insert the literal valid Proposal JSON used by this test at revision 1. This helper is test-only and must not change production interfaces.

```rust
#[test]
fn task_proposal_current_restores_without_writes_or_model_calls() {
    let (database, thread_id, proposal_id) = proposal_recovery_fixture("validated", future_expiry());
    let arguments = || vec![
        "--database".to_owned(), database.display().to_string(),
        "--thread-id".to_owned(), thread_id.clone(),
    ].into_iter();

    let first = task_proposal_current(arguments()).unwrap();
    let second = task_proposal_current(arguments()).unwrap();

    assert_eq!(first, second);
    assert_eq!(first["proposal_id"], proposal_id);
    assert_eq!(first["resolved_assignments"][0]["agent_id"], "data-researcher");
    let connection = Connection::open(&database).unwrap();
    let proposals: i64 = connection.query_row("SELECT count(*) FROM task_proposals", [], |row| row.get(0)).unwrap();
    let messages: i64 = connection.query_row("SELECT count(*) FROM task_thread_messages", [], |row| row.get(0)).unwrap();
    assert_eq!(proposals, 1);
    assert_eq!(messages, 2);
    fs::remove_file(database).unwrap();
}
```

The fixture must install/bind a real ready Skill using existing package bootstrap helpers. Do not hard-code a resolved employee that `resolve_task_assignment` would reject.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
cargo test --bin ai-employee-runtime task_proposal_current_restores_without_writes_or_model_calls
```

Expected: compilation fails because `task_proposal_current` does not exist.

- [ ] **Step 3: Add expiry and readiness-drift failure tests**

```rust
#[test]
fn task_proposal_current_rejects_expired_without_mutating_status() {
    let (database, thread_id, _) = proposal_recovery_fixture("validated", "1".to_owned());
    let error = task_proposal_current(proposal_current_arguments(&database, &thread_id)).unwrap_err();
    assert_eq!(error, "task_proposal_expired");
    let status: String = Connection::open(&database).unwrap()
        .query_row("SELECT status FROM task_proposals LIMIT 1", [], |row| row.get(0)).unwrap();
    assert_eq!(status, "validated");
    fs::remove_file(database).unwrap();
}

#[test]
fn task_proposal_current_rejects_stale_employee_resolution() {
    let (database, thread_id, _) = proposal_recovery_fixture("validated", future_expiry());
    Connection::open(&database).unwrap()
        .execute("UPDATE agents SET status='disabled' WHERE id='data-researcher'", []).unwrap();
    let error = task_proposal_current(proposal_current_arguments(&database, &thread_id)).unwrap_err();
    assert_eq!(error, "task_proposal_stale");
    fs::remove_file(database).unwrap();
}
```

- [ ] **Step 4: Implement the minimal read-only command**

Add command routing and usage text, then implement the query and response builder:

```rust
Some("task-proposal-current") => task_proposal_current(arguments),
```

```rust
fn task_proposal_current(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let (database, thread_id) = parse_database_and_thread_id(&mut arguments)?;
    let connection = Connection::open(database).map_err(|error| error.to_string())?;
    let (proposal_id, raw, hash, expires_at): (String, String, String, String) = connection
        .query_row(
            "SELECT id,proposal_json,proposal_sha256,expires_at FROM task_proposals
             WHERE thread_id=?1 AND revision=(SELECT current_revision FROM task_threads WHERE id=?1)
             AND status IN ('awaiting_input','validated') ORDER BY created_at DESC LIMIT 1",
            [&thread_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "task_proposal_not_found".to_owned())?;
    let current = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs();
    if current > expires_at.parse::<u64>().map_err(|_| "task_proposal_expiry_invalid")? {
        return Err("task_proposal_expired".into());
    }
    let proposal: Value = serde_json::from_str(&raw).map_err(|_| "task_proposal_invalid")?;
    let resolved_assignments = resolve_all_assignments(&connection, &proposal)
        .map_err(|_| "task_proposal_stale".to_owned())?;
    Ok(task_proposal_response(&proposal_id, &thread_id, &hash, resolved_assignments, proposal))
}
```

Reuse extracted parsers/builders from `task_proposal_generate`; do not duplicate the response shape or assignment resolution loop.

- [ ] **Step 5: Run focused and adjacent Runtime tests**

Run:

```bash
cargo test --bin ai-employee-runtime task_proposal_current
cargo test --bin ai-employee-runtime task_thread
cargo fmt --all --check
```

Expected: all selected tests pass; formatting exits 0.

- [ ] **Step 6: Commit the read-only recovery contract**

```bash
git add runtime/rust-core/src/main.rs
git commit -m "feat: restore current task proposal"
```

---

### Task 2: Persist safe generation failures and regenerate in place

**Files:**

- Modify: `runtime/rust-core/src/main.rs:847-996`
- Test: `runtime/rust-core/src/main.rs:4477-end`

**Interfaces:**

- Consumes: Task 1 response builders and current Thread revision.
- Produces: `fn task_proposal_regenerate(arguments: impl Iterator<Item = String>) -> Result<Value, String>`.
- Produces internal helper: `fn record_task_proposal_failure(connection: &mut Connection, thread_id: &str, error_code: &str) -> Result<(), String>`.
- Failure persistence begins only after database, Thread and goal validation succeed.

- [ ] **Step 1: Write a failing test for safe failure persistence**

Call proposal generation with a fake worker executable that exits nonzero and writes a provider error containing a fake secret/path. Assert the returned error remains stable while the stored message contains only the safe code:

Define `ProposalGenerationFixture` in the test module with `database`, `thread_id`, `repository_root`, `worker_path` and optional `old_proposal_id`. Its constructor reuses the real package bootstrap and Thread fixture from Task 1. `arguments_with_failing_worker` writes one executable temporary script that emits the supplied JSON to stderr and exits 2; `arguments_with_success_worker` writes one executable temporary script that emits the repository's literal valid two-assignment Proposal JSON and exits 0. Both methods pass their script path through the existing `--python` test seam and remove the script during fixture cleanup.

```rust
#[test]
fn task_proposal_failure_persists_only_a_safe_error_code() {
    let fixture = proposal_generation_fixture();
    let error = task_proposal_generate(fixture.arguments_with_failing_worker(
        r#"{"schema_version":"1.0","error_code":"network","detail":"sk-secret /Users/private"}"#,
    )).unwrap_err();
    assert_eq!(error, "task_proposal_provider_network");

    let connection = Connection::open(&fixture.database).unwrap();
    let content: String = connection.query_row(
        "SELECT content FROM task_thread_messages WHERE thread_id=?1 AND kind='error' ORDER BY sequence DESC LIMIT 1",
        [&fixture.thread_id], |row| row.get(0),
    ).unwrap();
    assert_eq!(content, "task_proposal_provider_network");
    assert!(!content.contains("sk-secret"));
    assert!(!content.contains("/Users/private"));
}
```

- [ ] **Step 2: Run the test and observe RED**

Run:

```bash
cargo test --bin ai-employee-runtime task_proposal_failure_persists_only_a_safe_error_code
```

Expected: FAIL because no `error` message is inserted.

- [ ] **Step 3: Write failing regenerate revision tests**

Cover both branches required by the design:

```rust
#[test]
fn regenerate_rejects_old_proposal_and_increments_revision_once() {
    let fixture = proposal_generation_fixture_with_validated_proposal();
    let response = task_proposal_regenerate(fixture.arguments_with_success_worker()).unwrap();
    assert_eq!(response["revision"], 2);
    assert_eq!(proposal_status(&fixture.database, &fixture.old_proposal_id), "rejected");
    assert_eq!(goal_count(&fixture.database, &fixture.thread_id), 1);
    assert_eq!(clarification_count(&fixture.database, &fixture.thread_id), 1);
}

#[test]
fn regenerate_legacy_draft_without_proposal_keeps_revision() {
    let fixture = proposal_generation_fixture();
    let response = task_proposal_regenerate(fixture.arguments_with_success_worker()).unwrap();
    assert_eq!(response["revision"], 1);
    assert_eq!(goal_count(&fixture.database, &fixture.thread_id), 1);
}
```

- [ ] **Step 4: Extract one generation pipeline and implement failure persistence**

Refactor without changing successful `task-proposal-generate` behavior:

```rust
enum ProposalGenerationMode { Initial, Regenerate }

fn generate_task_proposal(
    connection: &mut Connection,
    root: &Path,
    python: &Path,
    thread_id: &str,
    preferred_agent_id: Option<String>,
    mode: ProposalGenerationMode,
) -> Result<Value, String>
```

Move the existing catalog construction, Worker invocation, Schema validation, assignment resolution and atomic Proposal save into this function without changing their order. `Initial` uses the current revision. `Regenerate` first invalidates the old Proposal as described in Step 5, then reads the resulting revision before invoking the same pipeline.

At the outer command boundary, record only validated stable codes:

```rust
match generate_task_proposal(&mut connection, &root, &python, &thread_id, preferred, mode) {
    Ok(response) => Ok(response),
    Err(error) => {
        let safe_code = safe_task_proposal_error_code(&error);
        record_task_proposal_failure(&mut connection, &thread_id, &safe_code)?;
        Err(error)
    }
}
```

`safe_task_proposal_error_code` must return an allow-listed exact code or `task_proposal_unknown`; it must never store the unparsed input string.

- [ ] **Step 5: Implement explicit regeneration**

Add command routing and usage, then in a transaction:

```rust
let old_count = tx.execute(
    "UPDATE task_proposals SET status=CASE WHEN expires_at<?2 THEN 'expired' ELSE 'rejected' END,updated_at=?3
     WHERE thread_id=?1 AND status IN ('awaiting_input','validated')",
    rusqlite::params![thread_id, current_epoch_seconds, stamp],
)?;
if old_count > 0 {
    tx.execute(
        "UPDATE task_threads SET status='drafting',current_revision=current_revision+1,updated_at=?2 WHERE id=?1",
        rusqlite::params![thread_id, stamp],
    )?;
}
```

Commit this transaction before the model call. The subsequent shared pipeline saves the replacement Proposal against the resulting revision. Its model context query must use only `kind IN ('clarification')`; goal remains the separate objective.

- [ ] **Step 6: Run RED-to-GREEN verification and the Runtime suite**

Run:

```bash
cargo test --bin ai-employee-runtime task_proposal_failure_persists_only_a_safe_error_code
cargo test --bin ai-employee-runtime regenerate_
cargo test --bin ai-employee-runtime task_proposal_
cargo fmt --all --check
```

Expected: all commands exit 0. Confirm the first test was observed failing before implementation and now passes.

- [ ] **Step 7: Commit generation recovery**

```bash
git add runtime/rust-core/src/main.rs
git commit -m "fix: recover interrupted task proposals"
```

---

### Task 3: Model Proposal recovery as an explicit Swift state

**Files:**

- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift`
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift`
- Test: `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`

**Interfaces:**

- Consumes: `task-proposal-current`, `task-proposal-regenerate`, `TaskProposalResponse`, `TaskThreadProjection.status`.
- Produces: `enum TaskProposalPresentationState: Equatable` with `.idle`, `.restoring`, `.recoverable(message:)`, `.generating`, `.review(TaskProposalResponse)`, `.failed(message:diagnosticCode:)`.
- Produces: `TaskStore.restoreProposal(for:)` and `TaskStore.regenerateProposal()`.

- [ ] **Step 1: Write failing pure-state tests**

Add literal assertions to `ClientModelChecks.swift`:

```swift
expect(
    TaskProposalPresentationState.initial(threadStatus: "drafting", proposal: nil)
        == .recoverable(message: "上次方案未完成，可以重新生成。"),
    "drafting task thread offers explicit proposal recovery"
)
expect(
    TaskProposalPresentationState.initial(threadStatus: "running", proposal: nil) == .idle,
    "materialized task thread does not expose proposal recovery"
)
expect(
    TaskProposalPresentationState.failure(code: "task_proposal_provider_network")
        == .failed(message: "模型服务连接中断，请稍后重试。", diagnosticCode: "task_proposal_provider_network"),
    "proposal provider failures keep user copy and a stable diagnostic code"
)
```

- [ ] **Step 2: Run the client model command and observe RED**

Run the exact Swift compile-and-run block from `scripts/check.sh`, lines 20-38.

Expected: compilation fails because `TaskProposalPresentationState` does not exist.

- [ ] **Step 3: Implement the pure value state in `TaskThread.swift`**

```swift
enum TaskProposalPresentationState: Equatable, Sendable {
    case idle
    case restoring
    case recoverable(message: String)
    case generating
    case review(TaskProposalResponse)
    case failed(message: String, diagnosticCode: String)

    static func initial(threadStatus: String, proposal: TaskProposalResponse?) -> Self {
        if let proposal { return .review(proposal) }
        return threadStatus == "drafting"
            ? .recoverable(message: "上次方案未完成，可以重新生成。")
            : .idle
    }

    static func failure(code: String) -> Self {
        let message: String
        switch code {
        case "task_proposal_provider_network":
            message = "模型服务连接中断，请稍后重试。"
        case "task_proposal_provider_rate_limited":
            message = "模型服务当前请求过多，请稍后重试。"
        case "task_proposal_provider_authentication":
            message = "模型凭证无效或未配置，请检查设置后重试。"
        case "task_proposal_provider_quota":
            message = "模型服务额度不足，请检查账户额度后重试。"
        case "task_proposal_provider_server_temporary", "task_proposal_provider_dependency_unavailable":
            message = "模型服务暂时不可用，请稍后重试。"
        case "task_proposal_employee_catalog_empty", "task_proposal_assignee_not_ready":
            message = "当前没有具备所需能力的在职员工，请检查通讯录和技能库。"
        case "task_proposal_expired", "task_proposal_stale", "task_proposal_revision_conflict":
            message = "员工或能力状态已经变化，请重新生成方案。"
        case "task_proposal_provider_invalid_response", "task_proposal_schema_invalid":
            message = "方案格式未通过 Runtime 校验，请重新生成。"
        default:
            message = "方案生成失败，可以重新生成。"
        }
        return .failed(message: message, diagnosticCode: code)
    }
}
```

Add `Equatable` to `TaskProposalResponse` and nested DTOs so tests and SwiftUI state comparisons use value semantics.

- [ ] **Step 4: Add Runtime service methods**

Extend `RuntimeService` with exact signatures:

```swift
let taskProposalCurrent: @Sendable (String) async throws -> TaskProposalResponse
let taskProposalRegenerate: @Sendable (String) async throws -> TaskProposalResponse
```

Live implementations call:

```swift
["task-proposal-current", "--database", try databaseURL().path, "--thread-id", threadID]
["task-proposal-regenerate", "--repository-root", layout.resourceRoot.path,
 "--database", try databaseURL().path, "--thread-id", threadID]
```

Only regenerate receives `ModelConfiguration.environment()`. Current must pass no model credentials because it is read-only and does not call a provider.

Add an allow-listed extractor for Store state. It reads the raw associated value only from `RuntimeError.processFailed` and returns one of the known `task_proposal_*` codes or `task_proposal_unknown`:

```swift
static func taskProposalErrorCode(from error: Error) -> String {
    guard case let RuntimeError.processFailed(raw) = error else { return "task_proposal_unknown" }
    let known = [
        "task_proposal_provider_network", "task_proposal_provider_rate_limited",
        "task_proposal_provider_authentication", "task_proposal_provider_quota",
        "task_proposal_provider_server_temporary", "task_proposal_provider_dependency_unavailable",
        "task_proposal_provider_invalid_response", "task_proposal_schema_invalid",
        "task_proposal_employee_catalog_empty", "task_proposal_assignee_not_ready",
        "task_proposal_expired", "task_proposal_stale", "task_proposal_revision_conflict",
        "task_proposal_not_found",
    ]
    return known.first(where: raw.contains) ?? "task_proposal_unknown"
}
```

- [ ] **Step 5: Replace ambiguous Store state with explicit recovery flow**

Add:

```swift
@Published private(set) var proposalState: TaskProposalPresentationState = .idle
```

Required transitions:

```swift
func selectThread(_ thread: TaskThreadProjection?) {
    activeThread = thread
    proposalState = thread.map { .initial(threadStatus: $0.status, proposal: nil) } ?? .idle
    if let thread, ["awaiting_input", "awaiting_confirmation"].contains(thread.status) {
        Task { await restoreProposal(for: thread) }
    }
}
```

`restoreProposal(for:)` captures `thread.id`, sets `.restoring`, calls current, and applies the result only when `activeThread?.id` still equals the captured ID. Expired, stale and not-found responses become `.recoverable`; provider/schema errors become `.failed`. It never calls regenerate. Change `restoreThreads()` so every replacement of `activeThread` goes through `selectThread`; this prevents startup restore from bypassing Proposal recovery.

`regenerateProposal()` accepts any non-materialized Thread status in `drafting | awaiting_input | awaiting_confirmation`, sets `.generating`, calls regenerate, then sets `.review(response)` and refreshes Threads. Failure sets `.failed` without creating a new Thread.

Update `proposeWork`, `answerProposalQuestion`, `confirmAndRun` and `cancelWorkConfirmation` to drive `proposalState`; retain computed compatibility accessors only where the employee private-chat surface still reads `activeProposal` or `awaitingWorkConfirmation`.

- [ ] **Step 6: Add candidate identity resolution tests**

Define a pure function on `TaskProposalResponse`:

```swift
struct TaskProposalCandidateAssignment: Identifiable, Equatable, Sendable {
    let id: String
    let agentID: String
    let name: String
    let role: String
    let avatarPath: String?
    let goal: String
}

func candidateAssignments(employees: [Employee]) -> [TaskProposalCandidateAssignment]
```

Implement it in Proposal assignment order:

```swift
func candidateAssignments(employees: [Employee]) -> [TaskProposalCandidateAssignment] {
    proposal.assignments.compactMap { assignment in
        guard let resolved = resolvedAssignments.first(where: { $0.nodeID == assignment.nodeID }) else { return nil }
        let employee = employees.first(where: { $0.id == resolved.agentID })
        return TaskProposalCandidateAssignment(
            id: assignment.nodeID,
            agentID: resolved.agentID,
            name: employee?.name ?? resolved.agentID,
            role: employee?.role ?? "员工资料不可用",
            avatarPath: employee?.avatarPath,
            goal: assignment.goal
        )
    }
}
```

Test with literal fixtures that resolved `agent_id` is joined to name/role, assignment order follows Proposal assignments, and a missing Employee falls back to its `agent_id` instead of disappearing.

- [ ] **Step 7: Run focused Swift and source gates**

Run:

```bash
python3 scripts/check_task_room_ui.py
swift build --package-path apps/macos/AIEmployee
```

Also rerun the exact client model compile-and-run block from `scripts/check.sh`.

Expected: all exit 0.

- [ ] **Step 8: Commit the Swift recovery state**

```bash
git add \
  apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift \
  apps/macos/AIEmployee/Tests/ClientModelChecks.swift
git commit -m "feat: restore task proposal state"
```

---

### Task 4: Make candidate employees and recovery visible in Task Room

**Files:**

- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift:120-132`
- Modify: `apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift:4-195`
- Modify: `scripts/check_task_room_ui.py`

**Interfaces:**

- Consumes: `TaskStore.proposalState`, `TaskStore.regenerateProposal()`, `TaskProposalResponse.candidateAssignments(employees:)`, `EmployeeStore.employees`.
- Produces: visible recovery card, generating state and candidate assignment rows in every adaptive layout.

- [ ] **Step 1: Extend the UI gate first and observe RED**

Add assertions that catch the exact regression:

```python
assert 'Text("尚未匹配员工")' in view
assert 'Button("重新生成方案", action: store.regenerateProposal)' in view
assert 'Text("正在匹配员工…")' in view
assert 'Text("方案匹配")' in view
assert 'proposal.candidateAssignments(employees: employeeStore.employees)' in view
assert 'thread.room.participants.isEmpty ? "尚未匹配员工"' in view
```

Run:

```bash
python3 scripts/check_task_room_ui.py
```

Expected: FAIL on the first missing recovery assertion.

- [ ] **Step 2: Inject the employee directory without adding a second data source**

Change the view initializer and call site:

```swift
struct TaskThreadWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var employeeStore: EmployeeStore
}
```

```swift
TaskThreadWorkspaceView(store: store, employeeStore: employeeStore)
```

Do not load employees inside the Task Room. `ContentView` already owns and reloads `EmployeeStore`.

- [ ] **Step 3: Render state-specific content before the Timeline**

Inside the existing primary `LazyVStack`, switch on `store.proposalState`:

```swift
switch store.proposalState {
case .recoverable(let message): proposalRecoveryCard(message: message)
case .generating, .restoring: proposalLoadingCard()
case .review(let proposal): proposalReview(proposal)
case .failed(let message, let code): proposalFailureCard(message: message, code: code)
case .idle: EmptyView()
}
```

The recovery/failure cards use one primary action, `Button("重新生成方案", action: store.regenerateProposal)`. The loading card has `ProgressView` and 「正在匹配员工…」 with no cancel or duplicate submit action.

- [ ] **Step 4: Render candidate employee identity and assignment**

Replace the current preferred-ID-only row with:

```swift
Text("方案匹配").font(.caption.weight(.semibold))
ForEach(proposal.candidateAssignments(employees: employeeStore.employees)) { candidate in
    HStack(spacing: 10) {
        CreamAvatar(path: candidate.avatarPath, name: candidate.name, size: 32)
        VStack(alignment: .leading, spacing: 2) {
            Text(candidate.name).font(.callout.weight(.medium))
            Text("\(candidate.role) · \(candidate.goal)").font(.caption)
        }
    }
}
```

Keep missing input questions and the existing single confirmation action. Do not show Skill IDs, node IDs, hashes or full DAG details.

- [ ] **Step 5: Correct the zero-participant header**

Use explicit pre-materialization copy:

```swift
let participantSummary = thread.room.participants.isEmpty
    ? "尚未匹配员工"
    : "\(thread.room.participants.count) 位员工"
Text("\(participantSummary) · \(statusLabel(thread.status))")
```

The Inspector keeps 「参与员工」 for canonical bindings. When empty, add `Text("确认方案后显示正式参与员工")`; do not populate it from Proposal candidates.

- [ ] **Step 6: Run UI RED-to-GREEN, Swift build and adaptive gates**

Run:

```bash
python3 scripts/check_task_room_ui.py
python3 scripts/check_adaptive_layout.py
swift build --package-path apps/macos/AIEmployee
git diff --check
```

Expected: all exit 0. Record that `check_task_room_ui.py` failed before the view change and passed after it.

- [ ] **Step 7: Commit the Task Room UI**

```bash
git add \
  apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift \
  scripts/check_task_room_ui.py
git commit -m "fix: show task proposal participants"
```

---

### Task 5: Verify recovery in the packaged macOS App

**Files:**

- No planned modifications. If verification exposes a defect, return to the owning task, add a failing regression case there, and repeat its red-green cycle before continuing.
- Do not edit the user database directly as part of acceptance.

**Interfaces:**

- Consumes: Tasks 1-4.
- Produces: full automated gate evidence and real packaged App evidence.

- [ ] **Step 1: Run the full repository gate**

```bash
./scripts/check.sh
```

Expected: Rust formatting/tests/builds, contracts, Python tests, Swift model checks and Swift build all exit 0. Report exact failures rather than claiming partial success.

- [ ] **Step 2: Build and launch the signed local App**

```bash
./script/build_and_run.sh --verify
```

Expected: build, bundle signing, launch and process verification succeed.

- [ ] **Step 3: Verify the existing legacy draft without spending a model call**

Open 工作库 and select the existing `drafting` Thread. Confirm through screenshot and accessibility tree:

- Header reads 「尚未匹配员工 · 草拟中」.
- Main content shows the recovery explanation and 「重新生成方案」.
- Inspector says formal participants appear after confirmation.
- No automatic ProgressView/model request occurs merely from selecting the Thread or relaunching the App.

- [ ] **Step 4: Verify successful candidate visibility with a controlled Proposal**

Use the repository's deterministic fake Proposal path or a task-specific temporary database, not the user's production database. The fixture must resolve two real ready employees and preserve assignment order. Launch the packaged App against that controlled state and confirm:

- 「方案匹配」 lists both employee names and roles.
- Each row includes its own assignment goal.
- Hiding Inspector and narrowing the window do not hide the confirmation card or candidates.

- [ ] **Step 5: Verify restart continuity and zero extra model calls**

Before restart, record the controlled database's Proposal count and model-call count. Quit and relaunch the packaged App, reopen the Thread, then read both counts again:

```sql
SELECT thread_id, count(*) FROM task_proposals GROUP BY thread_id ORDER BY thread_id;
SELECT count(*) FROM model_calls;
```

Expected: counts are unchanged and the same Proposal/candidate rows reappear.

- [ ] **Step 6: Verify explicit regeneration failure and recovery**

With the controlled provider set to a deterministic failure, click 「重新生成方案」 once. Confirm one safe `error` message is persisted, the UI shows a specific recoverable message, and the database contains no provider body, fake secret or private path. Restore the deterministic valid response, click once, and confirm the Proposal review returns without creating another Thread or duplicate goal.

- [ ] **Step 7: Final scoped review**

```bash
git status --short --branch -uall
git diff --check HEAD~3..HEAD
git log --oneline --decorate -5
```

Confirm only the six declared production files, two test/gate files and this plan/spec history are involved. If unrelated files changed, leave them untouched and exclude them from any follow-up commit.

---

## Completion Criteria

- Existing `drafting` Threads no longer strand the user at 「0 位员工」.
- Current Proposal recovery is read-only and survives App restart without model calls.
- Explicit regeneration reuses the Thread, preserves goal/clarifications and invalidates the old Proposal.
- Candidate employees are visible before confirmation; formal participants remain canonical after confirmation.
- Safe error persistence is verified against a fake secret and private path.
- `./scripts/check.sh` and `./script/build_and_run.sh --verify` pass.
- Packaged App evidence covers legacy draft, two-employee Proposal, hidden Inspector, narrow window and restart continuity.
