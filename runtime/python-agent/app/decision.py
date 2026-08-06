import json


FORBIDDEN_FIELDS = {
    "call_id", "action_id", "idempotency_key", "permission_context",
    "approval_id", "deadline", "trace_id", "attempt",
}


def parse_decision(content: str) -> dict:
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("decision_schema_invalid: expected one JSON object") from exc
    if not isinstance(value, dict):
        raise ValueError("decision_schema_invalid: expected object")
    forbidden = FORBIDDEN_FIELDS.intersection(value)
    if forbidden:
        raise ValueError(f"decision_forbidden_field: {sorted(forbidden)[0]}")
    if value.get("schema_version") != "1.0.0":
        raise ValueError("decision_schema_invalid: unsupported schema_version")
    decision_type = value.get("type")
    required = {
        "ask_user": {"schema_version", "type", "question", "required_input_schema"},
        "tool_call": {"schema_version", "type", "tool_id", "action", "arguments", "rationale_summary"},
        "complete": {"schema_version", "type", "output", "deliverable_candidates", "evidence_refs"},
    }
    if decision_type not in required or set(value) != required[decision_type]:
        raise ValueError("decision_schema_invalid: fields do not match decision type")
    if decision_type == "tool_call" and not isinstance(value["arguments"], dict):
        raise ValueError("decision_schema_invalid: arguments must be object")
    if decision_type == "complete":
        if not isinstance(value["deliverable_candidates"], list) or not isinstance(value["evidence_refs"], list):
            raise ValueError("decision_schema_invalid: completion references must be arrays")
    return value
