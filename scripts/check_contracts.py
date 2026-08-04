import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(relative: str) -> dict:
    with (ROOT / relative).open(encoding="utf-8") as file:
        return json.load(file)


def require_fields(schema: dict, payload: dict) -> None:
    missing = set(schema["required"]) - payload.keys()
    if missing:
        raise AssertionError(f"missing required fields: {sorted(missing)}")
    if payload.get("schema_version") != schema["properties"]["schema_version"]["const"]:
        raise AssertionError("unsupported schema_version")


for name in ("tool-call", "tool-result"):
    require_fields(
        load(f"contracts/{name}.schema.json"),
        load(f"contracts/examples/{name}.valid.json"),
    )

try:
    require_fields(
        load("contracts/tool-call.schema.json"),
        load("contracts/fixtures/tool-call.invalid-schema-version.json"),
    )
except AssertionError:
    pass
else:
    raise AssertionError("invalid fixture must fail closed")

print("contract fixtures: ok")
