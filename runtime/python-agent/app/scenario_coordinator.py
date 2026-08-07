import json
import os
import sys

from .provider import DeepSeekProvider, DeterministicFakeProvider
from .provider_config import ProviderConfig


REQUEST_FIELDS = {
    "schema_version",
    "objective",
    "constraints",
    "overall_acceptance_criteria",
    "employee_catalog",
}


def _validate_request(request: dict) -> None:
    if set(request) != REQUEST_FIELDS or request.get("schema_version") != "1.0.0":
        raise ValueError("scenario_coordinator_request_invalid")
    if not isinstance(request.get("objective"), str) or not request["objective"].strip():
        raise ValueError("scenario_objective_required")
    if not isinstance(request.get("constraints"), list):
        raise ValueError("scenario_constraints_invalid")
    if not isinstance(request.get("overall_acceptance_criteria"), list) or not request["overall_acceptance_criteria"]:
        raise ValueError("scenario_acceptance_required")
    catalog = request.get("employee_catalog")
    if not isinstance(catalog, list) or not catalog:
        raise ValueError("scenario_employee_catalog_empty")
    for employee in catalog:
        if set(employee) != {"agent_id", "display_name", "ready_capabilities"}:
            raise ValueError("scenario_employee_catalog_invalid")
        if not isinstance(employee["ready_capabilities"], list):
            raise ValueError("scenario_employee_catalog_invalid")


def _messages(request: dict) -> list[dict[str, str]]:
    system = "\n".join([
        "You are the system-owned scenario coordinator for a local-first AI employee product.",
        "Return exactly one JSON object and no markdown.",
        "The object must use exactly these top-level fields: schema_version, proposal_id, title, objective, overall_acceptance_criteria, coordinator_agent_id, nodes, edges, assumptions, risks, questions_for_user.",
        "Every acceptance criterion must be an object with exactly criterion_id, description, evidence_type, required. evidence_type must be one of structured_output, artifact, tool_result, verification, evaluation. Use only evidence that the assigned Skill can actually produce.",
        "Create a serial DAG with 2 to 12 nodes. Include exactly one finalization node, assign it to coordinator_agent_id, and make it the last node.",
        "Each node must use only an agent_id and required_capabilities present together in employee_catalog.",
        "Node roles are coordinator, executor, finalization. failure_policy is stop, ask_user, or continue_independent.",
        "Each node budget must contain positive max_input_tokens, max_output_tokens, max_elapsed_ms and a non-negative max_tool_rounds.",
        "Do not emit Tool calls or security/runtime fields such as task_id, action_id, permission_context, approval_id, idempotency_key, trace_id, or secrets.",
        "This is only a proposal. Never claim it was saved, confirmed, started, or executed.",
    ])
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(request, ensure_ascii=False)},
    ]


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if not isinstance(request, dict):
            raise ValueError("scenario_coordinator_request_invalid")
        _validate_request(request)
        scripted = os.getenv("AI_EMPLOYEE_FAKE_SCENARIO_PROPOSAL")
        if scripted is not None:
            provider = DeterministicFakeProvider([scripted])
        else:
            config = ProviderConfig()
            config.validate()
            provider = DeepSeekProvider(config.deepseek_model, config.scenario_request_timeout_seconds)
        response = provider.complete_json(_messages(request))
        proposal = json.loads(response.content)
        if not isinstance(proposal, dict):
            raise ValueError("scenario_proposal_invalid")
        print(json.dumps(proposal, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
