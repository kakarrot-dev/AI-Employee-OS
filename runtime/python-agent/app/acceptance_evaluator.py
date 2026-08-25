import json
import os
import sys

from .provider import configured_provider
from .provider_config import ProviderConfig


def validate_result(request: dict, result: dict) -> dict:
    if set(result) != {"schema_version", "criteria"} or result.get("schema_version") != "1.0.0":
        raise ValueError("acceptance_evaluation_schema_invalid")
    expected = request["criteria"]
    reports = result.get("criteria")
    if not isinstance(reports, list) or len(reports) != len(expected):
        raise ValueError("acceptance_evaluation_criteria_mismatch")
    expected_by_id = {item["evaluation_key"]: item for item in expected}
    if len(expected_by_id) != len(expected):
        raise ValueError("acceptance_evaluation_key_conflict")
    seen: set[str] = set()
    for report in reports:
        if not isinstance(report, dict) or set(report) != {"evaluation_key", "passed", "reason", "evidence_refs"}:
            raise ValueError("acceptance_evaluation_report_invalid")
        key = report.get("evaluation_key")
        if key not in expected_by_id or key in seen:
            raise ValueError("acceptance_evaluation_criteria_mismatch")
        seen.add(key)
        if not isinstance(report.get("passed"), bool) or not isinstance(report.get("reason"), str) or not report["reason"].strip():
            raise ValueError("acceptance_evaluation_report_invalid")
        refs = report.get("evidence_refs")
        allowed = {item["ref"] for item in expected_by_id[key]["evidence"]}
        if not isinstance(refs, list) or len(refs) != len(set(refs)) or any(ref not in allowed for ref in refs):
            raise ValueError("acceptance_evaluation_evidence_invalid")
        if report["passed"] and not refs:
            raise ValueError("acceptance_evaluation_evidence_required")
    return result


def _fake_result(request: dict, raw: str) -> dict:
    if raw == "pass":
        return {
            "schema_version": "1.0.0",
            "criteria": [
                {
                    "evaluation_key": item["evaluation_key"],
                    "passed": bool(item["evidence"]),
                    "reason": "deterministic acceptance evaluator fixture",
                    "evidence_refs": [item["evidence"][0]["ref"]] if item["evidence"] else [],
                }
                for item in request["criteria"]
            ],
        }
    return json.loads(raw)


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if set(request) != {"schema_version", "task", "output", "criteria"} or request.get("schema_version") != "1.0.0":
            raise ValueError("acceptance_evaluation_request_invalid")
        scripted = os.getenv("AI_EMPLOYEE_FAKE_ACCEPTANCE_EVALUATION")
        if scripted is None and os.getenv("AI_EMPLOYEE_FAKE_DECISION") is not None:
            scripted = "pass"
        if scripted is not None:
            result = _fake_result(request, scripted)
        else:
            config = ProviderConfig.from_environment()
            config.validate()
            provider = configured_provider(config)
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an independent acceptance evaluator. Judge every criterion from the supplied output and evidence only. "
                        "Do not infer missing facts. A criterion passes only when its natural-language description is substantively satisfied and at least one supplied evidence ref directly supports it. "
                        "Return exactly one JSON object with schema_version and criteria. Each report must contain evaluation_key, passed, reason, evidence_refs."
                    ),
                },
                {"role": "user", "content": json.dumps(request, ensure_ascii=False, sort_keys=True)},
            ]
            result = json.loads(provider.complete_json(messages).content)
        print(json.dumps(validate_result(request, result), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
