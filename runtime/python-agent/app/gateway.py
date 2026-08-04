from dataclasses import dataclass
import json
from pathlib import Path
import subprocess

from .loop import ToolRequest


class GatewayError(Exception):
    pass


@dataclass(frozen=True)
class ToolRoute:
    action_id: str
    tool_id: str
    tool_version: str
    permission_grant_ids: tuple[str, ...]
    approval_id: str | None = None


@dataclass(frozen=True)
class GatewayContext:
    task_id: str
    agent_id: str
    deadline: str
    trace_id: str
    routes: dict[str, ToolRoute]


class SubprocessToolGateway:
    """Canonical Python-to-Rust boundary; this class never executes a Tool itself."""

    def __init__(self, executable: Path, database: Path, context: GatewayContext):
        self.executable = executable
        self.database = database
        self.context = context

    def execute(self, request: ToolRequest) -> dict:
        route = self.context.routes.get(request.action)
        if route is None:
            raise GatewayError(f"no locked Tool route for action {request.action}")
        tool_call = {
            "schema_version": "1.0",
            "call_id": request.call_id,
            "task_id": self.context.task_id,
            "action_id": route.action_id,
            "agent_id": self.context.agent_id,
            "tool_id": route.tool_id,
            "tool_version": route.tool_version,
            "action": request.action,
            "arguments": request.arguments,
            "idempotency_key": request.idempotency_key,
            "permission_context": {"grant_ids": list(route.permission_grant_ids)},
            "approval_id": route.approval_id,
            "deadline": self.context.deadline,
            "trace_id": self.context.trace_id,
            "attempt": 1,
        }
        try:
            process = subprocess.run(
                [str(self.executable), "--database", str(self.database)],
                input=json.dumps(tool_call, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise GatewayError(f"Rust Tool Gateway unavailable: {error}") from error
        if process.returncode != 0:
            message = process.stderr.strip() or f"exit code {process.returncode}"
            raise GatewayError(f"Rust Tool Gateway rejected the request: {message}")
        try:
            result = json.loads(process.stdout)
        except json.JSONDecodeError as error:
            raise GatewayError("Rust Tool Gateway returned invalid JSON") from error
        _validate_tool_result(result, request.call_id, self.context.trace_id)
        return result


def _validate_tool_result(result: object, call_id: str, trace_id: str) -> None:
    required = {
        "schema_version", "call_id", "status", "output", "error",
        "side_effect_state", "verification", "artifacts", "result_ref",
        "started_at", "finished_at", "duration_ms", "trace_id",
    }
    if not isinstance(result, dict) or set(result) != required:
        raise GatewayError("Rust Tool Gateway returned a non-canonical ToolResult")
    if result["schema_version"] != "1.0" or result["call_id"] != call_id:
        raise GatewayError("Rust Tool Gateway returned a mismatched ToolResult")
    if result["trace_id"] != trace_id:
        raise GatewayError("Rust Tool Gateway returned a mismatched trace_id")
    if result["status"] not in {"succeeded", "failed", "blocked", "result_unknown"}:
        raise GatewayError("Rust Tool Gateway returned an unknown status")
    if result["side_effect_state"] not in {"none", "not_started", "confirmed", "unknown"}:
        raise GatewayError("Rust Tool Gateway returned an unknown side_effect_state")
