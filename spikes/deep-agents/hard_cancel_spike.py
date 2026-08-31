from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph


DATA_DIR = Path(__file__).parent / ".spike-data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_DB = DATA_DIR / "hard-cancel.sqlite"
EFFECT_LOG = DATA_DIR / "hard-cancel-effect.log"
THREAD_CONFIG = {"configurable": {"thread_id": "hard-cancel-spike"}}


class State(TypedDict):
    completed: bool


def risky_node(state: State) -> State:
    """Create an effect and leave the node unfinished until killed."""
    with EFFECT_LOG.open("a", encoding="utf-8") as handle:
        handle.write("external-effect\n")
        handle.flush()
    if sys.argv[1] == "start":
        time.sleep(60)
    return {"completed": True}


def build_graph(checkpointer: SqliteSaver):
    builder = StateGraph(State)
    builder.add_node("risky", risky_node)
    builder.add_edge(START, "risky")
    builder.add_edge("risky", END)
    return builder.compile(checkpointer=checkpointer)


def effect_count() -> int:
    if not EFFECT_LOG.exists():
        return 0
    return len(EFFECT_LOG.read_text(encoding="utf-8").splitlines())


def start() -> None:
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        build_graph(checkpointer).invoke(
            {"completed": False},
            config=THREAD_CONFIG,
        )


def resume() -> dict[str, object]:
    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as checkpointer:
        graph = build_graph(checkpointer)
        state_before = graph.get_state(THREAD_CONFIG)
        result = graph.invoke(None, config=THREAD_CONFIG)
        payload = {
            "before_next": list(state_before.next),
            "after_completed": result["completed"],
            "effect_count": effect_count(),
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return payload


def verify() -> None:
    CHECKPOINT_DB.unlink(missing_ok=True)
    EFFECT_LOG.unlink(missing_ok=True)
    child = subprocess.Popen([sys.executable, __file__, "start"])
    deadline = time.monotonic() + 10
    while effect_count() == 0 and time.monotonic() < deadline:
        time.sleep(0.05)
    assert effect_count() == 1, "child never reached the external effect"
    child.kill()
    child.wait()
    payload = resume()
    assert payload == {
        "after_completed": True,
        "before_next": ["risky"],
        "effect_count": 2,
    }


if __name__ == "__main__":
    {"start": start, "resume": resume, "verify": verify}[sys.argv[1]]()
