import json

SCHEMA_VERSION = "1.0.0"
REQUIRED_FIELDS = {
    "ask_user": {"schema_version", "type", "question", "required_input_schema"},
    "tool_call": {"schema_version", "type", "skill_id", "tool_id", "action", "arguments", "rationale_summary"},
    "complete": {"schema_version", "type", "output", "deliverable_candidates", "evidence_refs"},
}
MODEL_FIELDS = {
    decision_type: fields - {"schema_version"}
    for decision_type, fields in REQUIRED_FIELDS.items()
}

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
    if value.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("decision_schema_invalid: unsupported schema_version")
    decision_type = value.get("type")
    if decision_type not in REQUIRED_FIELDS or set(value) != REQUIRED_FIELDS[decision_type]:
        raise ValueError("decision_schema_invalid: fields do not match decision type")
    if decision_type == "tool_call" and not isinstance(value["arguments"], dict):
        raise ValueError("decision_schema_invalid: arguments must be object")
    if decision_type == "complete":
        if not isinstance(value["deliverable_candidates"], list) or not isinstance(value["evidence_refs"], list):
            raise ValueError("decision_schema_invalid: completion references must be arrays")
    return value


def parse_model_decision(content: str, *, allow_observation_completion: bool = False) -> dict:
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("decision_schema_invalid: expected one JSON object") from exc
    if not isinstance(value, dict):
        raise ValueError("decision_schema_invalid: expected object")
    if len(value) == 1:
        wrapped_type = next(iter(value))
        wrapped_value = value[wrapped_type]
        if wrapped_type in MODEL_FIELDS and isinstance(wrapped_value, dict):
            value = {"type": wrapped_type, **wrapped_value}
    forbidden = FORBIDDEN_FIELDS.intersection(value)
    if forbidden:
        raise ValueError(f"decision_forbidden_field: {sorted(forbidden)[0]}")
    value.pop("schema_version", None)
    decision_type = value.get("type")
    if decision_type is None and allow_observation_completion:
        value = {"type": "complete", "output": value}
        decision_type = "complete"
    if decision_type == "complete":
        deliverable_candidates = value.pop("deliverable_candidates", [])
        evidence_refs = value.pop("evidence_refs", [])
        if "output" not in value:
            direct_output = {key: item for key, item in value.items() if key != "type"}
            value = {"type": "complete", "output": direct_output}
        value["deliverable_candidates"] = deliverable_candidates
        value["evidence_refs"] = evidence_refs
    if decision_type not in MODEL_FIELDS or set(value) != MODEL_FIELDS[decision_type]:
        field_names = ",".join(sorted(value))
        raise ValueError(
            f"decision_schema_invalid: fields do not match decision type "
            f"(type={decision_type!r}, fields=[{field_names}])"
        )
    value["schema_version"] = SCHEMA_VERSION
    return parse_decision(json.dumps(value))


def decision_contract_examples() -> dict:
    placeholders = {
        "question": "string", "required_input_schema": {}, "tool_id": "allowed tool id",
        "skill_id": "allowed skill id", "action": "allowed action", "arguments": {}, "rationale_summary": "string",
        "output": {}, "deliverable_candidates": [], "evidence_refs": [],
    }
    return {
        decision_type: {
            field: decision_type if field == "type" else placeholders[field]
            for field in sorted(fields)
        }
        for decision_type, fields in MODEL_FIELDS.items()
    }
