from __future__ import annotations

import hashlib
import json
import os
import socket
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from deepagents import GeneralPurposeSubagentProfile, HarnessProfile, create_deep_agent, register_harness_profile
from deepagents.middleware.subagents import CompiledSubAgent
from langchain.agents import create_agent
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool, tool
from langgraph.checkpoint.sqlite import SqliteSaver

EXCLUDED_TOOLS = frozenset({"write_file", "read_file", "edit_file", "delete", "ls", "glob", "grep", "execute"})


class NetworkDeniedSocket(socket.socket):
    def connect(self, address: object) -> None:
        raise PermissionError("worker_network_denied")

    def connect_ex(self, address: object) -> int:
        raise PermissionError("worker_network_denied")


class FormalModel(BaseChatModel):
    role: str
    employee_output: str
    model_name: str = "formal-harness"
    bound_tool_names: list[str] = []

    @property
    def _llm_type(self) -> str:
        return f"ai-employee-os-{self.role}"

    def _get_ls_params(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"ls_provider": "ai-employee-os", "ls_model_name": self.model_name, "ls_model_type": "chat"}

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Callable | BaseTool],
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        self.bound_tool_names = [str(tool.get("name")) if isinstance(tool, dict) else getattr(tool, "name", getattr(tool, "__name__", "unknown")) for tool in tools]
        return self

    def _generate(
        self,
        messages: Sequence[Any],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        if self.role == "employee":
            message = AIMessage(content=self.employee_output)
        else:
            handoffs = [message for message in messages if isinstance(message, ToolMessage) and message.name == "task"]
            if handoffs:
                message = AIMessage(content="handoff committed; manager review is controlled by Runtime")
            else:
                message = AIMessage(content="", tool_calls=[{"name": "task", "args": {"description": "Produce the frozen assignment output and return one handoff.", "subagent_type": "employee"}, "id": "delegate-1", "type": "tool_call"}])
        return ChatResult(generations=[ChatGeneration(message=message)])


def run_handoff(payload: dict[str, Any], checkpoint_dir: Path) -> dict[str, Any]:
    run_id = str(payload["runId"])
    assignment_id = str(payload["assignmentId"])
    employee_output = str(payload["employeeOutput"])
    allowed_tool_version_ids = sorted({str(value) for value in payload.get("allowedToolVersionIds", [])})
    if not run_id or not assignment_id or not employee_output:
        raise ValueError("invalid_worker_payload")
    checkpoint_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    database = checkpoint_dir / f"{run_id}.sqlite"
    database.unlink(missing_ok=True)

    register_harness_profile(
        "ai-employee-os:formal-harness",
        HarnessProfile(excluded_tools=EXCLUDED_TOOLS, general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False)),
    )
    root_model = FormalModel(role="manager", employee_output=employee_output)
    employee_model = FormalModel(role="employee", employee_output=employee_output)

    @tool
    def propose_tool_action(tool_version_id: str, parameters: dict[str, Any], parameter_sources: dict[str, Any]) -> str:
        """Submit a no-side-effect ToolAction Proposal for Runtime validation."""
        if tool_version_id not in allowed_tool_version_ids:
            raise ValueError("tool_outside_run_grant")
        return json.dumps({"toolVersionId": tool_version_id, "parameters": parameters, "parameterSources": parameter_sources}, ensure_ascii=False, sort_keys=True)

    employee_tools = [propose_tool_action] if allowed_tool_version_ids else []
    employee_graph = create_agent(model=employee_model, tools=employee_tools)
    with SqliteSaver.from_conn_string(str(database)) as checkpointer:
        agent = create_deep_agent(
            model=root_model,
            tools=[],
            subagents=[CompiledSubAgent(name="employee", description="The one immutable employee version selected by Runtime.", runnable=employee_graph)],
            checkpointer=checkpointer,
        )
        agent.invoke({"messages": [{"role": "user", "content": "Execute the one frozen serial assignment."}]}, config={"configurable": {"thread_id": run_id}}, interrupt_after=["tools"])
        state = agent.get_state({"configurable": {"thread_id": run_id}})
        handoffs = [message.content for message in state.values["messages"] if isinstance(message, ToolMessage) and message.name == "task"]

    if sorted(root_model.bound_tool_names) != ["task"]:
        raise RuntimeError(f"unexpected_root_tool_surface:{sorted(root_model.bound_tool_names)}")
    expected_employee_tools = ["propose_tool_action"] if allowed_tool_version_ids else []
    if sorted(employee_model.bound_tool_names) != expected_employee_tools:
        raise RuntimeError(f"unexpected_employee_tool_surface:{sorted(employee_model.bound_tool_names)}")
    if list(state.next) != ["model"] or len(state.interrupts) != 0 or handoffs[-1] != employee_output:
        raise RuntimeError("unsafe_checkpoint_state")
    return {
        "schemaVersion": 1,
        "runId": run_id,
        "assignmentId": assignment_id,
        "threadId": run_id,
        "next": list(state.next),
        "interruptCount": len(state.interrupts),
        "rootTools": sorted(root_model.bound_tool_names),
        "employeeTools": sorted(employee_model.bound_tool_names),
        "allowedToolVersionIds": allowed_tool_version_ids,
        "proposalOnly": True,
        "handoffSha256": hashlib.sha256(employee_output.encode("utf-8")).hexdigest(),
        "checkpointPath": database.name,
    }


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] != "handoff":
        raise SystemExit("usage: formal_worker.py handoff CHECKPOINT_DIR")
    payload = json.load(sys.stdin)
    socket.socket = NetworkDeniedSocket
    result = run_handoff(payload, Path(sys.argv[2]).resolve())
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
