from dataclasses import dataclass
import json
from time import perf_counter
from typing import Protocol

from .provider import ProviderRouter


@dataclass(frozen=True)
class LoopLimits:
    max_steps: int = 20
    max_tool_calls: int = 8


class LoopLimitExceeded(Exception):
    pass


class PlannerProtocolError(Exception):
    pass


class ToolExecutionStopped(Exception):
    def __init__(self, observation: dict):
        super().__init__("tool execution did not succeed; planner continuation is forbidden")
        self.observation = observation


class ToolResultUnknown(ToolExecutionStopped):
    def __init__(self, observation: dict):
        super().__init__("tool result is unknown and requires human verification")
        self.observation = observation


@dataclass(frozen=True)
class ToolRequest:
    call_id: str
    action: str
    arguments: dict
    idempotency_key: str


class ToolGateway(Protocol):
    def execute(self, request: ToolRequest) -> dict: ...


@dataclass(frozen=True)
class LoopRunResult:
    output: str
    steps: int
    tool_calls: int
    input_tokens: int
    output_tokens: int
    duration_ms: int
    provider_calls: dict[str, int]
    fallback_count: int


class BoundedPlannerLoop:
    def __init__(self, provider: ProviderRouter, limits: LoopLimits):
        if limits.max_steps < 1 or limits.max_tool_calls < 0:
            raise ValueError("invalid loop limits")
        self.provider = provider
        self.limits = limits

    def run(self, task_input: str) -> str:
        return self.run_with_metrics(task_input).output

    def run_with_metrics(self, task_input: str) -> LoopRunResult:
        messages = [{"role": "user", "content": task_input}]
        started = perf_counter()
        input_tokens = 0
        output_tokens = 0
        provider_calls: dict[str, int] = {}
        initial_fallbacks = len(self.provider.fallback_events)
        for step in range(1, self.limits.max_steps + 1):
            response = self.provider.complete(messages)
            input_tokens += response.input_tokens
            output_tokens += response.output_tokens
            provider_calls[response.provider] = provider_calls.get(response.provider, 0) + 1
            if response.content.startswith("FINAL:"):
                return LoopRunResult(
                    output=response.content.removeprefix("FINAL:").strip(),
                    steps=step,
                    tool_calls=0,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    duration_ms=max(0, int((perf_counter() - started) * 1000)),
                    provider_calls=provider_calls,
                    fallback_count=len(self.provider.fallback_events) - initial_fallbacks,
                )
            messages.append({"role": "assistant", "content": response.content})
        raise LoopLimitExceeded("planner reached max_steps without a final result")

    def run_with_tools(self, task_input: str, gateway: ToolGateway) -> LoopRunResult:
        messages = [{"role": "user", "content": task_input}]
        started = perf_counter()
        provider_calls: dict[str, int] = {}
        input_tokens = output_tokens = tool_calls = 0
        initial_fallbacks = len(self.provider.fallback_events)
        seen_call_ids: set[str] = set()
        seen_idempotency_keys: set[str] = set()
        for step in range(1, self.limits.max_steps + 1):
            response = self.provider.complete(messages)
            input_tokens += response.input_tokens
            output_tokens += response.output_tokens
            provider_calls[response.provider] = provider_calls.get(response.provider, 0) + 1
            decision = _planner_decision(response.content)
            if decision["type"] == "final":
                return LoopRunResult(
                    output=decision["content"],
                    steps=step,
                    tool_calls=tool_calls,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    duration_ms=max(0, int((perf_counter() - started) * 1000)),
                    provider_calls=provider_calls,
                    fallback_count=len(self.provider.fallback_events) - initial_fallbacks,
                )
            if tool_calls >= self.limits.max_tool_calls:
                raise LoopLimitExceeded("planner reached max_tool_calls")
            request = ToolRequest(
                call_id=decision["call_id"],
                action=decision["action"],
                arguments=decision["arguments"],
                idempotency_key=decision["idempotency_key"],
            )
            if request.call_id in seen_call_ids or request.idempotency_key in seen_idempotency_keys:
                raise PlannerProtocolError("planner repeated a ToolCall identity")
            seen_call_ids.add(request.call_id)
            seen_idempotency_keys.add(request.idempotency_key)
            observation = gateway.execute(request)
            _validate_observation(observation, request.call_id)
            tool_calls += 1
            if observation["status"] == "result_unknown":
                raise ToolResultUnknown(observation)
            if observation["status"] != "succeeded":
                raise ToolExecutionStopped(observation)
            messages.extend(
                [
                    {"role": "assistant", "content": response.content},
                    {
                        "role": "tool",
                        "content": json.dumps(observation, ensure_ascii=False, sort_keys=True),
                    },
                ]
            )
        raise LoopLimitExceeded("planner reached max_steps without a final result")


def _planner_decision(content: str) -> dict:
    try:
        decision = json.loads(content)
    except json.JSONDecodeError as exc:
        raise PlannerProtocolError("planner response must be one JSON object") from exc
    if not isinstance(decision, dict) or decision.get("type") not in {"final", "tool_call"}:
        raise PlannerProtocolError("unsupported planner decision")
    if decision["type"] == "final":
        if set(decision) != {"type", "content"} or not isinstance(decision["content"], str):
            raise PlannerProtocolError("invalid final decision")
        return decision
    required = {"type", "call_id", "action", "arguments", "idempotency_key"}
    if set(decision) != required:
        raise PlannerProtocolError("invalid tool_call fields")
    if not all(isinstance(decision[key], str) and decision[key] for key in required - {"type", "arguments"}):
        raise PlannerProtocolError("tool_call identifiers must be non-empty strings")
    if not isinstance(decision["arguments"], dict):
        raise PlannerProtocolError("tool_call arguments must be an object")
    return decision


def _validate_observation(observation: object, call_id: str) -> None:
    if not isinstance(observation, dict):
        raise PlannerProtocolError("ToolResult must be an object")
    if observation.get("schema_version") != "1.0" or observation.get("call_id") != call_id:
        raise PlannerProtocolError("ToolResult identity does not match ToolCall")
    if observation.get("status") not in {"succeeded", "failed", "blocked", "result_unknown"}:
        raise PlannerProtocolError("ToolResult status is invalid")
    if observation.get("side_effect_state") not in {"none", "not_started", "confirmed", "unknown"}:
        raise PlannerProtocolError("ToolResult side_effect_state is invalid")
    unknown = observation["side_effect_state"] == "unknown"
    if unknown != (observation["status"] == "result_unknown"):
        raise PlannerProtocolError("unknown side effect state must map exactly to result_unknown")
    if observation["status"] == "succeeded" and observation["side_effect_state"] not in {"none", "confirmed"}:
        raise PlannerProtocolError("succeeded requires a completed side effect state")
