import json
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
        if schema.get("uniqueItems") and len({json.dumps(item, sort_keys=True) for item in value}) != len(value):
            raise AssertionError(f"{path}: duplicate items")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                validate(item_schema, item, f"{path}[{index}]")

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise AssertionError(f"{path}: string is too short")
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
    steps = payload["skill"]["workflow"]["steps"]
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


def validate_contract(schema_name: str, payload_name: str) -> None:
    payload = load(f"contracts/{payload_name}")
    validate(load(f"contracts/{schema_name}"), payload)
    if schema_name == "tool-manifest.schema.json":
        validate_tool_policy(payload)
    if schema_name == "skill-manifest.schema.json":
        validate_skill_dag(payload)


VALID_CASES = (
    ("tool-call.schema.json", "examples/tool-call.valid.json"),
    ("tool-result.schema.json", "examples/tool-result.valid.json"),
    ("tool-manifest.schema.json", "examples/tool-manifest.valid.json"),
    ("skill-manifest.schema.json", "examples/skill-manifest.valid.json"),
)

INVALID_CASES = (
    ("tool-call.schema.json", "fixtures/tool-call.invalid-schema-version.json"),
    ("tool-call.schema.json", "fixtures/tool-call.unknown-field.json"),
    ("tool-result.schema.json", "fixtures/tool-result.invalid-status.json"),
    ("tool-manifest.schema.json", "fixtures/tool-manifest.unsafe-retry.json"),
    ("skill-manifest.schema.json", "fixtures/skill-manifest.cyclic-workflow.json"),
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
