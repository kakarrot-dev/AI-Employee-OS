import json
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(relative: str) -> dict:
    with (ROOT / relative).open(encoding="utf-8") as file:
        return json.load(file)


def validate(schema: dict, value: object, path: str = "$") -> None:
    if "const" in schema and value != schema["const"]:
        raise AssertionError(f"{path}: expected constant {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise AssertionError(f"{path}: unsupported value {value!r}")

    expected = schema.get("type")
    if expected is not None:
        allowed = expected if isinstance(expected, list) else [expected]
        matches = {
            "object": lambda item: isinstance(item, dict),
            "array": lambda item: isinstance(item, list),
            "string": lambda item: isinstance(item, str),
            "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
            "number": lambda item: isinstance(item, (int, float)) and not isinstance(item, bool),
            "boolean": lambda item: isinstance(item, bool),
            "null": lambda item: item is None,
        }
        if not any(matches[kind](value) for kind in allowed):
            raise AssertionError(f"{path}: expected {allowed}, got {type(value).__name__}")

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        missing = set(schema.get("required", [])) - value.keys()
        if missing:
            raise AssertionError(f"{path}: missing required fields {sorted(missing)}")
        if schema.get("additionalProperties") is False:
            unknown = set(value) - properties.keys()
            if unknown:
                raise AssertionError(f"{path}: unknown fields {sorted(unknown)}")
        for key, item in value.items():
            if key in properties:
                validate(properties[key], item, f"{path}.{key}")

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise AssertionError(f"{path}: too few items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            raise AssertionError(f"{path}: too many items")
        if schema.get("uniqueItems") and len({json.dumps(item, sort_keys=True) for item in value}) != len(value):
            raise AssertionError(f"{path}: duplicate items")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                validate(item_schema, item, f"{path}[{index}]")

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise AssertionError(f"{path}: string is too short")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            raise AssertionError(f"{path}: string is too long")
        pattern = schema.get("pattern")
        if pattern and re.fullmatch(pattern, value) is None:
            raise AssertionError(f"{path}: value does not match {pattern}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise AssertionError(f"{path}: below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise AssertionError(f"{path}: above maximum")


def validate_tool_policy(payload: dict) -> None:
    for action in payload["tool"]["actions"]:
        if action["risk_level"] >= 2 and action["confirmation"] == "never":
            raise AssertionError("high-risk actions require confirmation")
        retrying = action["retry_policy"]["max_attempts"] > 1
        if retrying and (action["idempotency"] == "unsafe" or action["side_effect"] == "irreversible"):
            raise AssertionError("unsafe or irreversible actions cannot retry automatically")


def validate_skill_dag(payload: dict) -> None:
    workflow = payload["skill"].get("workflow")
    if workflow is None:
        return
    steps = workflow["steps"]
    step_ids = [step["id"] for step in steps]
    if len(set(step_ids)) != len(step_ids):
        raise AssertionError("workflow step ids must be unique")
    known = set(step_ids)
    dependencies = {step["id"]: set(step["depends_on"]) for step in steps}
    if any(not deps <= known for deps in dependencies.values()):
        raise AssertionError("workflow references unknown dependencies")
    ready = [step_id for step_id, deps in dependencies.items() if not deps]
    visited: set[str] = set()
    while ready:
        current = ready.pop()
        if current in visited:
            continue
        visited.add(current)
        for step_id, deps in dependencies.items():
            if step_id not in visited and deps <= visited:
                ready.append(step_id)
    if visited != known:
        raise AssertionError("workflow must be acyclic")


def validate_eval_report(payload: dict) -> None:
    summary = payload["summary"]
    categories = payload["categories"]
    failures = payload["failures"]
    if summary["passed"] > summary["total"]:
        raise AssertionError("eval passed exceeds total")
    if sum(item["total"] for item in categories.values()) != summary["total"]:
        raise AssertionError("eval category totals do not match summary")
    if sum(item["passed"] for item in categories.values()) != summary["passed"]:
        raise AssertionError("eval category passes do not match summary")
    if any(item["passed"] > item["total"] for item in categories.values()):
        raise AssertionError("eval category passed exceeds total")
    if len(failures) != summary["total"] - summary["passed"]:
        raise AssertionError("eval failures do not match summary")
    if len({item["case_id"] for item in failures}) != len(failures):
        raise AssertionError("eval failure case ids must be unique")
    if any(item["score"] >= summary["threshold"] for item in failures):
        raise AssertionError("eval failure score meets threshold")
    expected_gate = summary["passed"] == summary["total"] and summary["average_score"] >= summary["threshold"]
    if summary["gate_passed"] != expected_gate:
        raise AssertionError("eval gate is inconsistent")


def validate_contract(schema_name: str, payload_name: str) -> None:
    payload = load(f"contracts/{payload_name}")
    validate(load(f"contracts/{schema_name}"), payload)
    if schema_name == "tool-manifest.schema.json":
        validate_tool_policy(payload)
    if schema_name == "skill-manifest.schema.json":
        validate_skill_dag(payload)
    if schema_name == "decision-context.schema.json":
        prompt = payload["prompt"]
        if hashlib.sha256(prompt["content"].encode()).hexdigest() != prompt["sha256"]:
            raise AssertionError("decision context prompt hash mismatch")
        measured = sum(len(value) for value in (
            payload["schema_version"], prompt["id"], prompt["version"], prompt["sha256"],
            prompt["content"], payload["task"]["id"], payload["task"]["input"],
        ))
        for section in payload["sections"]:
            measured += len(section["kind"]) + len(section["trust"])
            for item in section["items"]:
                measured += len(item["id"]) + len(item["content"]) + len(item["content_hash"])
                measured += len(item["source_uri"] or "")
        if payload["budget"]["used_chars"] != measured:
            raise AssertionError("decision context used_chars mismatch")
        if payload["budget"]["used_chars"] > payload["budget"]["max_chars"]:
            raise AssertionError("decision context exceeds its declared budget")
        kinds = [section["kind"] for section in payload["sections"]]
        if len(kinds) != len(set(kinds)):
            raise AssertionError("decision context sections must be unique")
    if schema_name == "eval-report.schema.json":
        validate_eval_report(payload)


VALID_CASES = (
    ("agent-decision.schema.json", "examples/agent-decision.valid.json"),
    ("agent-run-request.schema.json", "examples/agent-run-request.valid.json"),
    ("agent-run-state.schema.json", "examples/agent-run-state.valid.json"),
    ("skill-run-result.schema.json", "examples/skill-run-result.valid.json"),
    ("artifact-ref.schema.json", "examples/artifact-ref.valid.json"),
    ("deliverable.schema.json", "examples/deliverable.valid.json"),
    ("context-snapshot.schema.json", "examples/context-snapshot.valid.json"),
    ("toolset-snapshot.schema.json", "examples/toolset-snapshot.valid.json"),
    ("tool-call.schema.json", "examples/tool-call.valid.json"),
    ("tool-result.schema.json", "examples/tool-result.valid.json"),
    ("tool-manifest.schema.json", "examples/tool-manifest.valid.json"),
    ("skill-manifest.schema.json", "examples/skill-manifest.valid.json"),
    ("decision-context.schema.json", "examples/decision-context.valid.json"),
    ("eval-report.schema.json", "examples/eval-report.valid.json"),
    ("runtime-event.schema.json", "examples/runtime-event.valid.json"),
    ("chat-message.schema.json", "examples/chat-message.valid.json"),
    ("employee-profile.schema.json", "examples/employee-profile.valid.json"),
)

INVALID_CASES = (
    ("agent-decision.schema.json", "fixtures/agent-decision.forbidden-field.json"),
    ("agent-run-state.schema.json", "fixtures/agent-run-state.invalid-phase.json"),
    ("deliverable.schema.json", "fixtures/deliverable.invalid-status.json"),
    ("tool-call.schema.json", "fixtures/tool-call.invalid-schema-version.json"),
    ("tool-call.schema.json", "fixtures/tool-call.unknown-field.json"),
    ("tool-result.schema.json", "fixtures/tool-result.invalid-status.json"),
    ("tool-manifest.schema.json", "fixtures/tool-manifest.unsafe-retry.json"),
    ("skill-manifest.schema.json", "fixtures/skill-manifest.cyclic-workflow.json"),
    ("decision-context.schema.json", "fixtures/decision-context.invalid-budget.json"),
    ("eval-report.schema.json", "fixtures/eval-report.invalid-score.json"),
    ("runtime-event.schema.json", "fixtures/runtime-event.invalid-type.json"),
    ("chat-message.schema.json", "fixtures/chat-message.invalid-role.json"),
    ("employee-profile.schema.json", "fixtures/employee-profile.invalid-status.json"),
)

for schema_name, payload_name in VALID_CASES:
    validate_contract(schema_name, payload_name)

for schema_name, payload_name in INVALID_CASES:
    try:
        validate_contract(schema_name, payload_name)
    except AssertionError:
        continue
    raise AssertionError(f"invalid fixture must fail closed: {payload_name}")

print("contract fixtures: ok")
