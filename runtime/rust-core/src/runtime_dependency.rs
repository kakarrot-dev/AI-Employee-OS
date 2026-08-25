use std::{path::PathBuf, process::Command};

use serde_json::Value;

pub fn agent_reach_doctor() -> Option<Value> {
    [
        PathBuf::from("agent-reach"),
        PathBuf::from("/opt/homebrew/bin/agent-reach"),
        PathBuf::from("/usr/local/bin/agent-reach"),
    ]
    .iter()
    .find_map(|candidate| {
        Command::new(candidate)
            .args(["doctor", "--json"])
            .output()
            .ok()
            .filter(|output| output.status.success())
    })
    .and_then(|output| serde_json::from_slice(&output.stdout).ok())
}

pub fn tool_available(tool_id: &str) -> bool {
    match tool_id {
        "agent-reach-tool" => agent_reach_tool_available(),
        _ => true,
    }
}

fn agent_reach_tool_available() -> bool {
    if let Some(available) = explicit_mcporter_available() {
        return available;
    }
    agent_reach_doctor()
        .and_then(|doctor| doctor.get("exa_search").cloned())
        .is_some_and(|source| {
            source["status"] == "ok"
                && source["active_backend"]
                    .as_str()
                    .is_some_and(|backend| !backend.is_empty())
        })
}

fn explicit_mcporter_available() -> Option<bool> {
    std::env::var_os("AI_EMPLOYEE_MCPORTER_PATH")
        .map(PathBuf::from)
        .map(|path| path.is_file())
}
