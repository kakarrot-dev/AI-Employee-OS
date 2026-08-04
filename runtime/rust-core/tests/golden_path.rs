use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::Connection;
use serde_json::Value;

#[test]
fn real_process_golden_path_persists_terminal_states_and_prd() {
    let root = temporary_root();
    let output_dir = root.join("output");
    let database = root.join("runtime.sqlite3");
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let result = run_golden(
        &repository,
        &database,
        &output_dir,
        "为企业 AI 知识库设计一个 PRD",
    );
    assert!(
        result.status.success(),
        "{} {}",
        String::from_utf8_lossy(&result.stderr),
        String::from_utf8_lossy(&result.stdout)
    );
    let response: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(response["status"], "succeeded");
    assert_eq!(response["evaluation"]["score"], 1.0);
    assert_eq!(response["decision_context"]["prompt"]["version"], "1.0.0");
    assert!(
        response["decision_context"]["budget"]["used_chars"]
            .as_u64()
            .unwrap()
            <= response["decision_context"]["budget"]["max_chars"]
                .as_u64()
                .unwrap()
    );
    assert_eq!(response["memory_outcome"], "stored");
    assert_eq!(response["graph"]["engine"], "runtime-dag-v1");
    assert_eq!(response["graph"]["nodes"].as_array().unwrap().len(), 2);
    assert!(
        response["graph"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|node| node["status"] == "succeeded")
    );
    assert_eq!(response["events"].as_array().unwrap().len(), 4);
    let artifact = PathBuf::from(response["artifact_path"].as_str().unwrap());
    let content = fs::read_to_string(artifact).unwrap();
    assert!(content.contains("Given 用户已授权目标目录"));
    assert!(content.contains("seed://golden/interviews#golden-interviews:0"));

    let repeated = run_golden(
        &repository,
        &database,
        &output_dir,
        "为企业 AI 知识库设计第二版 PRD",
    );
    assert!(
        repeated.status.success(),
        "{} {}",
        String::from_utf8_lossy(&repeated.stderr),
        String::from_utf8_lossy(&repeated.stdout)
    );
    let repeated_response: Value = serde_json::from_slice(&repeated.stdout).unwrap();
    assert_eq!(repeated_response["memory_outcome"], "duplicate");
    let first_memory_id = format!("memory-{}", response["task_id"].as_str().unwrap());
    assert!(
        repeated_response["decision_context"]["sections"]
            .as_array()
            .unwrap()
            .iter()
            .find(|section| section["kind"] == "memory")
            .unwrap()["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == first_memory_id)
    );

    let connection = Connection::open(database).unwrap();
    let statuses: (i64, i64, i64, i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT count(*) FROM tasks WHERE status='succeeded'),
                    (SELECT count(*) FROM actions WHERE status='succeeded'),
                    (SELECT count(*) FROM tool_executions WHERE status='succeeded'),
                    (SELECT count(*) FROM permissions),
                    (SELECT count(*) FROM memories),
                    (SELECT count(*) FROM knowledge_sources WHERE index_status='indexed')",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(statuses, (2, 4, 2, 0, 2, 1));
    let snapshot: String = connection
        .query_row(
            "SELECT context_policy_snapshot_json FROM task_execution_snapshots WHERE task_id=?1",
            [response["task_id"].as_str().unwrap()],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!snapshot.contains("为企业 AI 知识库设计一个 PRD"));
    assert!(!snapshot.contains("企业用户要求权限隔离"));
    assert!(snapshot.contains("decision_context_sha256"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn sandboxed_worker_cannot_write_artifact_or_database_directly() {
    let root = temporary_root();
    let output_dir = root.join("output");
    let database = root.join("runtime.sqlite3");
    let worker = root.join("malicious-worker.py");
    let sensitive = root.join("secret.txt");
    fs::write(&sensitive, "must-not-be-readable").unwrap();
    let script = format!(
        r###"#!/usr/bin/env python3
import json, socket, subprocess, sys
request = json.loads(sys.stdin.readline())
blocked = []
for target in [request["artifact_path"], {database:?}]:
    try:
        open(target, "w").write("bypass")
        blocked.append(False)
    except Exception:
        blocked.append(True)
try:
    open({sensitive:?}).read()
    blocked.append(False)
except Exception:
    blocked.append(True)
try:
    socket.create_connection(("127.0.0.1", 9), timeout=0.1)
    blocked.append(False)
except PermissionError:
    blocked.append(True)
except Exception:
    blocked.append(False)
try:
    subprocess.run(["/usr/bin/true"], check=True)
    blocked.append(False)
except Exception:
    blocked.append(True)
content = """# 产品需求文档
## 1. 背景与证据
来源：用户输入，未知事实保持待确认。
## 2. 用户问题
用户需要可靠 PRD，价值是降低返工成本。
用户价值明确。
## 3. 产品目标与指标
目标覆盖率 100%。
## 4. 范围与非范围
范围是 Markdown PRD；非范围是网页抓取和多 Agent。
## 5. 用户流程
正常路径：输入、规划、审批、执行、评价。
## 6. 功能与权限设计
Rust Runtime 执行工具，最小权限且数据边界仅在授权目录。
## 7. 异常与恢复
审批拒绝停止；结果未知不得重放并人工核验。
## 8. 验收标准
Given 已授权，When 执行，Then 只生成 1 份 PRD 且 Task succeeded。
## 9. 风险与待确认项
风险、指标基线和评审人待确认。
"""
print(json.dumps({{"schema_version":"1.0","type":"tool_call","call_id":request["call_id"],"action":"create_markdown","arguments":{{"path":request["artifact_path"],"content":content}},"idempotency_key":request["idempotency_key"]}}), flush=True)
json.loads(sys.stdin.readline())
print(json.dumps({{"schema_version":"1.0","type":"final","content":"done","metrics":{{"direct_writes_blocked":all(blocked)}}}}), flush=True)
"###,
        database = database.to_string_lossy(),
        sensitive = sensitive.to_string_lossy()
    );
    fs::write(&worker, script).unwrap();
    fs::set_permissions(&worker, fs::Permissions::from_mode(0o755)).unwrap();
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let result = run_golden_with_python(
        &repository,
        &database,
        &output_dir,
        "验证 Worker 权限边界",
        Some(&worker),
    );
    assert!(
        result.status.success(),
        "{} {}",
        String::from_utf8_lossy(&result.stderr),
        String::from_utf8_lossy(&result.stdout)
    );
    let response: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(response["worker_metrics"]["direct_writes_blocked"], true);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejected_evaluation_does_not_create_experience_memory() {
    let root = temporary_root();
    let output_dir = root.join("output");
    let database = root.join("runtime.sqlite3");
    let worker = root.join("low-quality-worker.py");
    let script = r###"#!/usr/bin/env python3
import json, sys
request = json.loads(sys.stdin.readline())
print(json.dumps({"schema_version":"1.0","type":"tool_call","call_id":request["call_id"],"action":"create_markdown","arguments":{"path":request["artifact_path"],"content":"# incomplete"},"idempotency_key":request["idempotency_key"]}), flush=True)
json.loads(sys.stdin.readline())
print(json.dumps({"schema_version":"1.0","type":"final","content":"done","metrics":{}}), flush=True)
"###;
    fs::write(&worker, script).unwrap();
    fs::set_permissions(&worker, fs::Permissions::from_mode(0o755)).unwrap();
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let result = run_golden_with_python(
        &repository,
        &database,
        &output_dir,
        "生成不完整 PRD",
        Some(&worker),
    );
    assert!(!result.status.success());
    let connection = Connection::open(database).unwrap();
    let counts: (i64, i64) = connection
        .query_row(
            "SELECT
               (SELECT count(*) FROM memories WHERE owner_type='agent' AND memory_type='experience'),
               (SELECT count(*) FROM memory_provenance)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(counts, (0, 0));
    fs::remove_dir_all(root).unwrap();
}

fn run_golden(
    repository: &PathBuf,
    database: &PathBuf,
    output_dir: &PathBuf,
    input: &str,
) -> std::process::Output {
    run_golden_with_python(repository, database, output_dir, input, None)
}

fn run_golden_with_python(
    repository: &PathBuf,
    database: &PathBuf,
    output_dir: &PathBuf,
    input: &str,
    python: Option<&PathBuf>,
) -> std::process::Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_ai-employee-runtime"));
    command.args([
        "run-golden",
        "--repository-root",
        repository.to_string_lossy().as_ref(),
        "--database",
        database.to_string_lossy().as_ref(),
        "--output-dir",
        output_dir.to_string_lossy().as_ref(),
        "--input",
        input,
        "--approve-write",
    ]);
    if let Some(python) = python {
        command.args(["--python", python.to_string_lossy().as_ref()]);
    }
    command.output().unwrap()
}

fn temporary_root() -> PathBuf {
    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(1);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let sequence = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!(
        "ai-employee-golden-{}-{nonce}-{sequence}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    root
}
