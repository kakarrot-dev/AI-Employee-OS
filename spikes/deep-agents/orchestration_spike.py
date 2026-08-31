from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.middleware.subagents import CompiledSubAgent
from langchain.agents import create_agent
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool, tool
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command


DATA_DIR = Path(
    os.environ.get(
        "AI_EMPLOYEE_OS_SPIKE_DIR",
        Path(__file__).parent / ".spike-data",
    )
)
DATA_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_DB = DATA_DIR / "orchestration.sqlite"
SAFE_STOP_DB = DATA_DIR / "safe-stop.sqlite"
EFFECT_LOG = DATA_DIR / "effect.log"
THREAD_CONFIG = {"configurable": {"thread_id": "orchestration-spike"}}
SAFE_STOP_CONFIG = {"configurable": {"thread_id": "safe-stop-spike"}}


class RuleModel(BaseChatModel):
    """Deterministic model used to test graph behavior without a Provider."""

    role: str
    tools: Sequence[dict[str, Any] | type | Callable | BaseTool] = ()

    @property
    def _llm_type(self) -> str:
        return f"rule-{self.role}"

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Callable | BaseTool],
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        self.tools = tools
        return self

    def _generate(
        self,
        messages: Sequence[Any],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        tool_messages = [
            message for message in messages if isinstance(message, ToolMessage)
        ]
        if self.role == "manager":
            response = self._manager_response(tool_messages)
        elif self.role == "worker_text":
            response = AIMessage(content="employee produced handoff")
        else:
            response = self._employee_response(tool_messages)
        return ChatResult(generations=[ChatGeneration(message=response)])

    @staticmethod
    def _manager_response(tool_messages: list[ToolMessage]) -> AIMessage:
        if any(message.name == "task" for message in tool_messages):
            return AIMessage(content="manager accepted employee result")
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "task",
                    "args": {
                        "description": "record one approved effect and report completion",
                        "subagent_type": "employee",
                    },
                    "id": "delegate-1",
                    "type": "tool_call",
                }
            ],
        )

    @staticmethod
    def _employee_response(tool_messages: list[ToolMessage]) -> AIMessage:
        if any(message.name == "record_effect" for message in tool_messages):
            return AIMessage(content="employee completed tool decision")
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "record_effect",
                    "args": {"value": "approved-once"},
                    "id": "effect-1",
                    "type": "tool_call",
                }
            ],
        )


@tool(description="Record one externally visible effect")
def record_effect(value: str) -> str:
    with EFFECT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(value + "\n")
    return "effect-recorded"


def build_approval_agent(checkpointer: SqliteSaver):
    return create_deep_agent(
        model=RuleModel(role="manager"),
        tools=[],
        subagents=[
            {
                "name": "employee",
                "description": "Records one approved effect.",
                "system_prompt": (
                    "Call record_effect once and then report completion."
                ),
                "model": RuleModel(role="employee"),
                "tools": [record_effect],
            }
        ],
        interrupt_on={"record_effect": True},
        checkpointer=checkpointer,
    )


def build_safe_stop_agent(checkpointer: SqliteSaver):
    employee = create_agent(model=RuleModel(role="worker_text"), tools=[])
    return create_deep_agent(
        model=RuleModel(role="manager"),
        tools=[],
        subagents=[
            CompiledSubAgent(
                name="employee",
                description="Produces one text handoff.",
                runnable=employee,
            )
        ],
        checkpointer=checkpointer,
    )


def effect_count() -> int:
    if not EFFECT_LOG.exists():
        return 0
    return len(EFFECT_LOG.read_text(encoding="utf-8").splitlines())


def approval_pause() -> None:
    CHECKPOINT_DB.unlink(missing_ok=True)
    EFFECT_LOG.unlink(missing_ok=True)
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        agent = build_approval_agent(checkpointer)
        result = agent.invoke(
            {"messages": [HumanMessage(content="Delegate the work to employee.")]},
            config=THREAD_CONFIG,
        )
        state = agent.get_state(THREAD_CONFIG)
        payload = {
            "result_has_interrupt": "__interrupt__" in result,
            "interrupt_count": len(state.interrupts),
            "next": list(state.next),
            "effect_count": effect_count(),
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload == {
            "effect_count": 0,
            "interrupt_count": 1,
            "next": ["tools"],
            "result_has_interrupt": True,
        }


def approval_resume() -> None:
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        agent = build_approval_agent(checkpointer)
        result = agent.invoke(
            Command(resume={"decisions": [{"type": "approve"}]}),
            config=THREAD_CONFIG,
        )
        state = agent.get_state(THREAD_CONFIG)
        final_messages = [
            message.content
            for message in result["messages"]
            if isinstance(message, AIMessage) and message.content
        ]
        payload = {
            "interrupt_count": len(state.interrupts),
            "next": list(state.next),
            "effect_count": effect_count(),
            "final_message": final_messages[-1],
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload == {
            "effect_count": 1,
            "final_message": "manager accepted employee result",
            "interrupt_count": 0,
            "next": [],
        }


def rejection() -> None:
    approval_pause()
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        agent = build_approval_agent(checkpointer)
        agent.invoke(
            Command(
                resume={
                    "decisions": [
                        {"type": "reject", "message": "effect not authorized"}
                    ]
                }
            ),
            config=THREAD_CONFIG,
        )
        state = agent.get_state(THREAD_CONFIG)
        payload = {
            "interrupt_count": len(state.interrupts),
            "next": list(state.next),
            "effect_count": effect_count(),
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload == {
            "effect_count": 0,
            "interrupt_count": 0,
            "next": [],
        }


def safe_pause() -> None:
    SAFE_STOP_DB.unlink(missing_ok=True)
    with SqliteSaver.from_conn_string(str(SAFE_STOP_DB)) as checkpointer:
        agent = build_safe_stop_agent(checkpointer)
        agent.invoke(
            {"messages": [HumanMessage(content="Delegate the work to employee.")]},
            config=SAFE_STOP_CONFIG,
            interrupt_after=["tools"],
        )
        state = agent.get_state(SAFE_STOP_CONFIG)
        task_results = [
            message.content
            for message in state.values["messages"]
            if isinstance(message, ToolMessage) and message.name == "task"
        ]
        payload = {
            "interrupt_count": len(state.interrupts),
            "next": list(state.next),
            "task_result": task_results[-1],
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload == {
            "interrupt_count": 0,
            "next": ["model"],
            "task_result": "employee produced handoff",
        }


def safe_resume() -> None:
    with SqliteSaver.from_conn_string(str(SAFE_STOP_DB)) as checkpointer:
        agent = build_safe_stop_agent(checkpointer)
        result = agent.invoke(None, config=SAFE_STOP_CONFIG)
        state = agent.get_state(SAFE_STOP_CONFIG)
        final_messages = [
            message.content
            for message in result["messages"]
            if isinstance(message, AIMessage) and message.content
        ]
        payload = {
            "interrupt_count": len(state.interrupts),
            "next": list(state.next),
            "final_message": final_messages[-1],
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload == {
            "final_message": "manager accepted employee result",
            "interrupt_count": 0,
            "next": [],
        }


def stream() -> None:
    CHECKPOINT_DB.unlink(missing_ok=True)
    EFFECT_LOG.unlink(missing_ok=True)
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        agent = build_approval_agent(checkpointer)
        events = list(
            agent.stream(
                {"messages": [HumanMessage(content="Delegate the work to employee.")]},
                config=THREAD_CONFIG,
                stream_mode="updates",
                subgraphs=True,
            )
        )
        namespaces = sorted(
            {"/".join(namespace) or "root" for namespace, _ in events}
        )
        nodes = sorted({node for _, update in events for node in update})
        payload = {
            "event_count": len(events),
            "namespaces": namespaces,
            "nodes": nodes,
            "effect_count": effect_count(),
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        assert payload["event_count"] > 0
        assert "root" in payload["namespaces"]
        assert any(namespace != "root" for namespace in payload["namespaces"])
        assert payload["effect_count"] == 0


def tool_surface() -> None:
    with SqliteSaver.from_conn_string(":memory:") as checkpointer:
        agent = build_approval_agent(checkpointer)
        tools = sorted(agent.nodes["tools"].bound._tools_by_name)
        print(json.dumps({"root_tool_node": tools}, sort_keys=True))
        assert "task" in tools
        assert "execute" in tools
        assert "write_file" in tools


if __name__ == "__main__":
    {
        "approval_pause": approval_pause,
        "approval_resume": approval_resume,
        "rejection": rejection,
        "safe_pause": safe_pause,
        "safe_resume": safe_resume,
        "stream": stream,
        "tool_surface": tool_surface,
    }[sys.argv[1]]()
