import json
import os
import sys

from .provider import DeepSeekProvider, DeterministicFakeProvider, PoeProvider, ProviderFailure
from .provider_config import ProviderConfig


REQUEST_FIELDS = {"schema_version", "objective", "thread_context", "employee_catalog", "preferred_agent_id"}
PROPOSAL_FIELDS = {"schema_version", "intent", "title", "objective", "missing_inputs", "deliverable", "assignments", "acceptance_criteria", "requested_resources", "budget_hint"}


def validate_request(request: dict) -> None:
    if set(request) != REQUEST_FIELDS or request.get("schema_version") != "1.0.0":
        raise ValueError("task_proposal_request_invalid")
    if not isinstance(request.get("objective"), str) or not request["objective"].strip():
        raise ValueError("task_proposal_objective_required")
    if not isinstance(request.get("thread_context"), list):
        raise ValueError("task_proposal_context_invalid")
    if not isinstance(request.get("employee_catalog"), list) or not request["employee_catalog"]:
        raise ValueError("task_proposal_employee_catalog_empty")
    for employee in request["employee_catalog"]:
        if set(employee) != {"agent_id", "display_name", "ready_capabilities"}:
            raise ValueError("task_proposal_employee_catalog_invalid")


def messages(request: dict) -> list[dict[str, str]]:
    system = "\n".join([
        "You propose work for a local-first AI employee system. Return exactly one JSON object.",
        "Use exactly: schema_version, intent, title, objective, missing_inputs, deliverable, assignments, acceptance_criteria, requested_resources, budget_hint.",
        "intent is chat, single_agent_task, or multi_agent_task. Prefer one agent unless distinct capabilities, permissions, a verified handoff, or an explicit user request requires multiple agents.",
        "When the objective requires both public-web evidence and a saved local document, create a multi_agent_task with a web-search research assignment followed by a local-file-operations finalizer whenever the catalog provides those least-privilege specialists.",
        "Each assignment has node_id, role, employee_selector, goal, depends_on, acceptance_criteria. Use node-level acceptance criteria for that employee only.",
        "A multi_agent_task must contain exactly one finalizer, and every non-final assignment needed by the finalizer must appear in depends_on.",
        "Acceptance evidence must match the node's actual output. A web-search research handoff normally requires tool_result and structured_output, not artifact. Require artifact only when that node's goal explicitly creates or edits a file using a file capability. The final file-producing node requires artifact.",
        "For a requested file deliverable without a user-supplied path, choose a safe relative Markdown filename in deliverable.target_path. Do not ask the user for an output directory because the client supplies the authorized output root after confirmation.",
        "Use only employee IDs and ready capabilities from employee_catalog. Ask only execution-blocking questions in missing_inputs.",
        "Never emit task/run/action/work-order IDs, grants, approvals, idempotency keys, secrets, verified claims, or tool calls.",
        "This is a proposal only; never claim it was confirmed or executed.",
    ])
    return [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(request, ensure_ascii=False)}]


def validate_proposal(proposal: object) -> dict:
    if not isinstance(proposal, dict) or set(proposal) != PROPOSAL_FIELDS:
        raise ValueError("proposal_fields_invalid")
    if proposal.get("schema_version") != "1.0.0" or proposal.get("intent") not in {"chat", "single_agent_task", "multi_agent_task"}:
        raise ValueError("proposal_header_invalid")
    for field in ("title", "objective"):
        if not isinstance(proposal.get(field), str) or not proposal[field].strip():
            raise ValueError(f"proposal_{field}_invalid")
    if not isinstance(proposal.get("missing_inputs"), list):
        raise ValueError("proposal_missing_inputs_invalid")
    for item in proposal["missing_inputs"]:
        if not isinstance(item, dict) or set(item) != {"key", "question", "required"} or not isinstance(item.get("required"), bool):
            raise ValueError("proposal_missing_input_invalid")
    deliverable = proposal.get("deliverable")
    if not isinstance(deliverable, dict) or set(deliverable) != {"type", "description", "target_path"}:
        raise ValueError("proposal_deliverable_invalid")
    if not isinstance(proposal.get("assignments"), list):
        raise ValueError("proposal_assignments_invalid")
    for item in proposal["assignments"]:
        if not isinstance(item, dict) or set(item) != {"node_id", "role", "employee_selector", "goal", "depends_on", "acceptance_criteria"}:
            raise ValueError("proposal_assignment_invalid")
        selector = item.get("employee_selector")
        if not isinstance(selector, dict) or set(selector) != {"preferred_id", "capabilities"} or not isinstance(selector.get("capabilities"), list):
            raise ValueError("proposal_employee_selector_invalid")
        if item.get("role") not in {"owner", "contributor", "finalizer"} or not isinstance(item.get("depends_on"), list):
            raise ValueError("proposal_assignment_invalid")
        validate_acceptance(item.get("acceptance_criteria"), "proposal_assignment_acceptance_invalid")
    validate_acceptance(proposal.get("acceptance_criteria"), "proposal_acceptance_criteria_invalid")
    if not isinstance(proposal.get("requested_resources"), list):
        raise ValueError("proposal_requested_resources_invalid")
    budget = proposal.get("budget_hint")
    if not isinstance(budget, dict) or set(budget) != {"input_tokens", "output_tokens", "tool_rounds", "wall_clock_ms"} or any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in budget.values()):
        raise ValueError("proposal_budget_invalid")
    return proposal


def validate_acceptance(criteria: object, error_code: str) -> None:
    if not isinstance(criteria, list) or not criteria:
        raise ValueError(error_code)
    for item in criteria:
        if not isinstance(item, dict):
            raise ValueError(f"{error_code}_must_be_object")
        if set(item) != {"criterion_id", "description", "evidence_type", "required"} or item.get("evidence_type") not in {"structured_output", "artifact", "tool_result", "evaluation"} or not isinstance(item.get("required"), bool):
            raise ValueError(error_code)

def generate_valid_proposal(provider, request: dict) -> dict:
    prompt = messages(request)
    schema_path = os.path.join(os.path.dirname(__file__), "../../../contracts/task-proposal.schema.json")
    with open(schema_path, encoding="utf-8") as handle:
        schema = json.load(handle)
    last_error = "proposal_invalid"
    for attempt in range(2):
        try:
            return validate_proposal(json.loads(provider.complete_json(prompt, schema, "task_proposal").content))
        except (ValueError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            if attempt == 0:
                prompt.append({"role": "assistant", "content": "The previous proposal was invalid."})
                prompt.append({"role": "user", "content": f"Correct the proposal and return the complete JSON object again. Validation error: {last_error}. acceptance_criteria must be an array of objects, never strings."})
    raise ValueError(last_error)


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        validate_request(request)
        scripted = os.getenv("AI_EMPLOYEE_FAKE_TASK_PROPOSAL")
        if scripted is not None:
            provider = DeterministicFakeProvider([scripted])
        else:
            config = ProviderConfig.from_environment()
            config.validate()
            provider = PoeProvider(config.poe_model, config.scenario_request_timeout_seconds) if config.provider == "poe" else DeepSeekProvider(config.deepseek_model, config.scenario_request_timeout_seconds)
        proposal = generate_valid_proposal(provider, request)
        print(json.dumps(proposal, ensure_ascii=False))
        return 0
    except ProviderFailure as exc:
        print(json.dumps({"schema_version": "1.0", "error_code": exc.kind.value}), file=sys.stderr)
        return 2
    except Exception:
        print(json.dumps({"schema_version": "1.0", "error_code": "invalid_response"}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
