use std::{env, path::PathBuf, process::ExitCode};

use ai_employee_runtime::golden_path::{GoldenPathConfig, run};
use ai_employee_runtime::storage::migrate;
use rusqlite::{Connection, TransactionBehavior, types::Type};
use serde_json::json;

fn main() -> ExitCode {
    match command() {
        Ok(result) => {
            println!("{result}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("ai-employee-runtime failed: {message}");
            ExitCode::FAILURE
        }
    }
}

fn command() -> Result<serde_json::Value, String> {
    let mut arguments = env::args().skip(1);
    match arguments.next().as_deref() {
        Some("run-golden") => run_golden(arguments),
        Some("list-tasks") => list_tasks(arguments),
        Some("cancel-task") => cancel_task(arguments),
        Some("events") => list_events(arguments),
        _ => Err(usage()),
    }
}

fn run_golden(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut output_dir = None;
    let mut python = PathBuf::from("python3");
    let mut task_input = None;
    let mut task_id = None;
    let mut approve_write = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--output-dir" => output_dir = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--input" => task_input = arguments.next(),
            "--task-id" => task_id = arguments.next(),
            "--approve-write" => approve_write = true,
            _ => return Err(usage()),
        }
    }
    run(&GoldenPathConfig {
        repository_root: repository_root.ok_or_else(usage)?,
        database: database.ok_or_else(usage)?,
        output_dir: output_dir.ok_or_else(usage)?,
        python,
        task_input: task_input.ok_or_else(usage)?,
        task_id,
        approve_write,
    })
}

fn list_tasks(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let database = database.ok_or_else(usage)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT t.id,t.input,t.status,t.created_at,t.updated_at,
                    COALESCE(json_group_array(json_object(
                      'step_id', COALESCE(json_extract(a.input_json,'$.step_id'), substr(a.id, instr(a.id, ':') + 1)),
                      'action_id', a.id,
                      'status', a.status,
                      'output_as', COALESCE(json_extract(a.input_json,'$.output_as'), '')
                    )) FILTER (WHERE a.id IS NOT NULL), '[]'),
                    (SELECT json_extract(output_json,'$.path') FROM actions
                     WHERE task_id=t.id AND json_type(output_json,'$.path')='text'
                     ORDER BY created_at DESC LIMIT 1),
                    (SELECT score FROM evaluations WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    (SELECT json_extract(metrics_json,'$.delivery_allowed') FROM evaluations
                     WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    COALESCE((SELECT json_group_array(json_object(
                      'schema_version','1.0', 'event_id',event_id, 'sequence',sequence,
                      'task_id',task_id, 'type',event_type, 'occurred_at',occurred_at
                    )) FROM runtime_events WHERE task_id=t.id ORDER BY sequence), '[]'),
                    EXISTS(SELECT 1 FROM task_cancellation_requests c
                           WHERE c.task_id=t.id AND c.acknowledged_at IS NULL)
             FROM tasks t LEFT JOIN actions a ON a.task_id=t.id
             GROUP BY t.id ORDER BY t.created_at DESC, t.id DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let actions: String = row.get(5)?;
            let events: String = row.get(9)?;
            let score: Option<f64> = row.get(7)?;
            let delivery_allowed: Option<bool> = row.get(8)?;
            Ok(json!({
                "task_id": row.get::<_, String>(0)?,
                "input": row.get::<_, String>(1)?,
                "status": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
                "updated_at": row.get::<_, String>(4)?,
                "actions": serde_json::from_str::<serde_json::Value>(&actions).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(5, Type::Text, Box::new(error))
                })?,
                "artifact_path": row.get::<_, Option<String>>(6)?,
                "evaluation": score.map(|score| json!({
                    "score": score,
                    "delivery_allowed": delivery_allowed.unwrap_or(false)
                })),
                "events": serde_json::from_str::<serde_json::Value>(&events).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(9, Type::Text, Box::new(error))
                })?,
                "cancellation_requested": row.get::<_, bool>(10)?
            }))
        })
        .map_err(|error| error.to_string())?;
    let tasks = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","tasks":tasks}))
}

fn cancel_task(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, task_id, _) = task_command_arguments(&mut arguments, false)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let now: String = transaction
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO task_cancellation_requests(task_id,requested_at,acknowledged_at)
             SELECT id,?2,NULL FROM tasks WHERE id=?1 AND status IN ('pending','running')
             ON CONFLICT(task_id) DO NOTHING",
            rusqlite::params![task_id, now],
        )
        .map_err(|error| error.to_string())?;
    let state: (String, bool) = transaction
        .query_row(
            "SELECT status, EXISTS(SELECT 1 FROM task_cancellation_requests WHERE task_id=tasks.id)
             FROM tasks WHERE id=?1",
            [&task_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| format!("task is not cancellable: {error}"))?;
    if !matches!(state.0.as_str(), "pending" | "running") || !state.1 {
        return Err(format!("task is already terminal: {}", state.0));
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","task_id":task_id,"status":"cancellation_requested"}))
}

fn list_events(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, task_id, after) = task_command_arguments(&mut arguments, true)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT event_id,sequence,event_type,payload_json,occurred_at FROM runtime_events
         WHERE task_id=?1 AND sequence>?2 ORDER BY sequence",
        )
        .map_err(|error| error.to_string())?;
    let events = statement.query_map(rusqlite::params![task_id, after], |row| {
        let payload: String = row.get(3)?;
        Ok(json!({
            "schema_version":"1.0", "event_id":row.get::<_,String>(0)?,
            "sequence":row.get::<_,i64>(1)?, "task_id":task_id,
            "type":row.get::<_,String>(2)?, "occurred_at":row.get::<_,String>(4)?,
            "payload":serde_json::from_str::<serde_json::Value>(&payload).map_err(|error| rusqlite::Error::FromSqlConversionFailure(3, Type::Text, Box::new(error)))?
        }))
    }).map_err(|error| error.to_string())?
      .collect::<Result<Vec<_>,_>>().map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","task_id":task_id,"after":after,"events":events}))
}

fn task_command_arguments(
    arguments: &mut impl Iterator<Item = String>,
    allow_after: bool,
) -> Result<(PathBuf, String, i64), String> {
    let mut database = None;
    let mut task_id = None;
    let mut after = 0;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--task-id" => task_id = arguments.next(),
            "--after" if allow_after => {
                after = arguments
                    .next()
                    .ok_or_else(usage)?
                    .parse()
                    .map_err(|_| usage())?
            }
            _ => return Err(usage()),
        }
    }
    Ok((
        database.ok_or_else(usage)?,
        task_id.ok_or_else(usage)?,
        after,
    ))
}

fn usage() -> String {
    "usage: ai-employee-runtime run-golden ... | list-tasks --database <path> | cancel-task --database <path> --task-id <id> | events --database <path> --task-id <id> [--after <sequence>]".to_owned()
}
