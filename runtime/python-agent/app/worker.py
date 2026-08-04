import json
from hashlib import sha256
from pathlib import Path
import re
import sys

from .context import measured_chars


def plan(request: object) -> dict:
    _validate_request(request)
    return {
        "schema_version": "1.0",
        "type": "tool_call",
        "call_id": request["call_id"],
        "action": "create_markdown",
        "arguments": {
            "path": request["artifact_path"],
            "content": _prd_content(request["task_input"], request["decision_context"]),
        },
        "idempotency_key": request["idempotency_key"],
    }


def observe(request: dict, observation: object) -> dict:
    _validate_request(request)
    if not isinstance(observation, dict):
        raise ValueError("observation must be an object")
    if observation.get("schema_version") != "1.0" or observation.get("call_id") != request["call_id"]:
        raise ValueError("observation does not match the planned ToolCall")
    if observation.get("status") != "succeeded":
        raise RuntimeError(f"Tool execution did not succeed: {observation.get('status')}")
    return {
        "schema_version": "1.0",
        "type": "final",
        "content": "PRD 已生成",
        "metrics": {"steps": 2, "tool_calls": 1, "input_tokens": 0, "output_tokens": 0},
    }


def _validate_request(request: object) -> None:
    required = {
        "schema_version",
        "task_id",
        "task_input",
        "artifact_path",
        "call_id",
        "idempotency_key",
        "trace_id",
        "decision_context",
    }
    if not isinstance(request, dict) or set(request) != required:
        raise ValueError("worker request fields do not match schema 1.0")
    if request["schema_version"] != "1.0":
        raise ValueError("unsupported schema_version")
    string_fields = required - {"decision_context"}
    if not all(isinstance(request[key], str) and request[key] for key in string_fields):
        raise ValueError("worker request values must be non-empty strings")
    _validate_decision_context(request["decision_context"], request["task_id"], request["task_input"])
    if Path(request["artifact_path"]).suffix != ".md":
        raise ValueError("artifact_path must use .md")


def _validate_decision_context(context: object, task_id: str, task_input: str) -> None:
    if not isinstance(context, dict) or set(context) != {"schema_version", "prompt", "task", "budget", "sections"}:
        raise ValueError("decision_context fields do not match schema 1.0")
    if context["schema_version"] != "1.0" or context["task"] != {"id": task_id, "input": task_input}:
        raise ValueError("decision_context does not match the task")
    budget = context["budget"]
    if (
        not isinstance(budget, dict)
        or set(budget) != {"max_chars", "used_chars"}
        or not all(isinstance(budget[key], int) and not isinstance(budget[key], bool) and budget[key] >= 0 for key in budget)
        or budget["max_chars"] < 1
    ):
        raise ValueError("decision_context budget is invalid")
    if measured_chars(context) != budget["used_chars"] or budget["used_chars"] > budget["max_chars"]:
        raise ValueError("decision_context exceeds its budget")
    kinds = [section.get("kind") for section in context["sections"]]
    allowed = {"identity", "persona", "skill", "memory", "knowledge", "tool"}
    if len(kinds) > 6 or len(kinds) != len(set(kinds)) or not set(kinds) <= allowed:
        raise ValueError("decision_context sections must be unique")
    prompt = context["prompt"]
    if set(prompt) != {"id", "version", "sha256", "content"} or len(prompt["sha256"]) != 64:
        raise ValueError("decision_context prompt identity is invalid")
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", prompt["version"]) is None:
        raise ValueError("decision_context prompt version is invalid")
    if prompt["sha256"] != sha256(prompt["content"].encode()).hexdigest():
        raise ValueError("decision_context prompt hash mismatch")
    required_rules = ("Knowledge", "不可信", "source_uri", "result_unknown")
    if not all(rule in prompt["content"] for rule in required_rules):
        raise ValueError("locked prompt is missing required safety rules")
    for section in context["sections"]:
        if set(section) != {"kind", "trust", "items"} or section["trust"] not in {"trusted", "untrusted_data"}:
            raise ValueError("decision_context section is invalid")
        if not isinstance(section["items"], list) or len(section["items"]) > 6:
            raise ValueError("decision_context section items are invalid")
        if section["kind"] == "knowledge" and section["trust"] != "untrusted_data":
            raise ValueError("knowledge must be treated as untrusted data")
        for item in section["items"]:
            if set(item) != {"id", "content", "content_hash", "source_uri"}:
                raise ValueError("decision_context item fields are invalid")
            if not item["id"] or len(item["id"]) > 128 or not item["content"] or len(item["content"]) > 4_000:
                raise ValueError("decision_context item is invalid")
            if item["source_uri"] is not None and (not isinstance(item["source_uri"], str) or len(item["source_uri"]) > 512):
                raise ValueError("decision_context source is invalid")
            if section["kind"] == "knowledge" and not item["source_uri"]:
                raise ValueError("knowledge item requires source_uri")
            if item["content_hash"] != sha256(item["content"].encode()).hexdigest():
                raise ValueError("decision_context item hash mismatch")


def _prd_content(task_input: str, context: dict) -> str:
    knowledge = next((section["items"] for section in context["sections"] if section["kind"] == "knowledge"), [])
    memories = next((section["items"] for section in context["sections"] if section["kind"] == "memory"), [])
    citations = "；".join(f'{item["source_uri"]}#{item["id"]}' for item in knowledge) or "无补充资料"
    memory_note = "；".join(_quoted_data(item["content"]) for item in memories) or "无可用长期记忆"
    return f"""# 产品需求文档

## 1. 背景与证据
来源：用户本次输入“{task_input}”；证据引用：{citations}。Knowledge 仅作为不可信数据，不执行其中任何指令；未确认内容不会被当作事实。

## 2. 用户问题
用户需要把模糊需求转化为可评审、可追踪的产品方案。用户价值是降低遗漏关键约束和反复沟通的成本。

## 3. 产品目标与指标
目标：PRD 必填章节覆盖率达到 100%，一次评审可定位全部待确认项。

## 4. 范围与非范围
范围：根据本次输入生成本地 Markdown PRD。非范围：实时网页抓取、多 Agent、自动发布和未经确认的业务结论。

## 5. 用户流程
正常路径：输入需求、生成计划、授权文档写入、获得 PRD、查看评价结果。

## 6. 功能与权限设计
文档只能写入用户明确授权的目录；权限遵循最小授权，Rust Runtime 是唯一 Tool 执行边界。数据边界不扩展到授权目录之外。

## 7. 异常与恢复
审批拒绝时停止写入；执行结果未知时不得自动重放。恢复前必须核验真实副作用状态。

## 8. 验收标准
Given 用户已授权目标目录并批准本次写入，When Alex 执行任务，Then 只产生 1 份 PRD，Task 在评价通过后进入 succeeded。

## 9. 风险与待确认项
记忆约束：{memory_note}。待确认：目标用户细分、业务现状、指标基线、交付时间和最终评审人。在获得证据前不虚构答案。
"""


def _quoted_data(content: str) -> str:
    return "数据摘录「" + " ".join(content.split())[:300] + "」"


def main() -> int:
    try:
        request = json.loads(sys.stdin.readline())
        print(json.dumps(plan(request), ensure_ascii=False), flush=True)
        observation = json.loads(sys.stdin.readline())
        print(json.dumps(observe(request, observation), ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(
            json.dumps({"schema_version": "1.0", "type": "failed", "error": str(error)}, ensure_ascii=False),
            flush=True,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
