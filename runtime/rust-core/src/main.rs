use std::{env, path::PathBuf, process::ExitCode};

use ai_employee_runtime::golden_path::{GoldenPathConfig, run};

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
    if arguments.next().as_deref() != Some("run-golden") {
        return Err(usage());
    }
    let mut repository_root = None;
    let mut database = None;
    let mut output_dir = None;
    let mut python = PathBuf::from("python3");
    let mut task_input = None;
    let mut approve_write = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--output-dir" => output_dir = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--input" => task_input = arguments.next(),
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
        approve_write,
    })
}

fn usage() -> String {
    "usage: ai-employee-runtime run-golden --repository-root <path> --database <sqlite-path> --output-dir <path> --input <task> --approve-write [--python <python3>]".to_owned()
}
