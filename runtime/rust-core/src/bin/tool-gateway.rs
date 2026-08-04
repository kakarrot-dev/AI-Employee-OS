use std::{
    env,
    io::{self, Read},
    process::ExitCode,
};

use ai_employee_runtime::{storage::migrate, tool::ToolCall, tool_executor::ToolExecutor};
use rusqlite::Connection;

fn main() -> ExitCode {
    match run() {
        Ok(result) => {
            println!("{result}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("tool gateway failed: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<String, String> {
    let database_path = database_path()?;
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("could not read ToolCall: {error}"))?;
    let call: ToolCall =
        serde_json::from_str(&input).map_err(|error| format!("invalid ToolCall JSON: {error}"))?;

    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("could not open runtime database: {error}"))?;
    migrate(&mut connection).map_err(|error| format!("migration failed: {error}"))?;
    let now: String = connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("could not read runtime clock: {error}"))?;
    let result = ToolExecutor::new(&mut connection).execute(&call, &now);
    serde_json::to_string(&result).map_err(|error| format!("could not encode ToolResult: {error}"))
}

fn database_path() -> Result<String, String> {
    let mut arguments = env::args().skip(1);
    match (
        arguments.next().as_deref(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some("--database"), Some(path), None) if !path.is_empty() => Ok(path),
        _ => Err("usage: tool-gateway --database <sqlite-path>".to_owned()),
    }
}
