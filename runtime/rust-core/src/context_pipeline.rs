use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub fn build(
    agent_prompt: &str,
    capabilities: &Value,
    input: &Value,
    tools: &Value,
    observations: &Value,
    max_bytes: usize,
) -> Result<Value, String> {
    let sections = json!([
        {"kind":"runtime_policy","trust":"trusted","content":"Tool calls require Rust authorization."},
        {"kind":"agent_prompt","trust":"trusted","content":agent_prompt},
        {"kind":"capabilities","trust":"trusted_package","content":capabilities},
        {"kind":"tool_descriptions","trust":"trusted_registry","content":tools},
        {"kind":"task_input","trust":"untrusted_data","content":input},
        {"kind":"observations","trust":"untrusted_data","content":observations}
    ]);
    let serialized = sections.to_string();
    if serialized.len() > max_bytes {
        return Err("context_budget_exceeded".to_owned());
    }
    Ok(
        json!({"sections":sections,"sha256":format!("{:x}",Sha256::digest(serialized.as_bytes())),"size_bytes":serialized.len(),"max_bytes":max_bytes}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fails_closed_on_budget() {
        assert_eq!(
            build(
                "a",
                &json!(["b"]),
                &json!({"x":"long"}),
                &json!([]),
                &json!([]),
                4
            )
            .unwrap_err(),
            "context_budget_exceeded"
        );
    }
}
