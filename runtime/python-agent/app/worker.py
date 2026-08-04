import json
from pathlib import Path
import sys


def plan(request: object) -> dict:
    _validate_request(request)
    return {
        "schema_version": "1.0",
        "type": "tool_call",
        "call_id": request["call_id"],
        "action": "create_markdown",
        "arguments": {
            "path": request["artifact_path"],
            "content": _prd_content(request["task_input"]),
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
    }
    if not isinstance(request, dict) or set(request) != required:
        raise ValueError("worker request fields do not match schema 1.0")
    if request["schema_version"] != "1.0":
        raise ValueError("unsupported schema_version")
    if not all(isinstance(request[key], str) and request[key] for key in required):
        raise ValueError("worker request values must be non-empty strings")
    if Path(request["artifact_path"]).suffix != ".md":
        raise ValueError("artifact_path must use .md")


def _prd_content(task_input: str) -> str:
    return f"""# 产品需求文档

## 1. 背景与证据
来源：用户本次输入“{task_input}”。当前没有补充业务资料，未确认内容不会被当作事实。

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
待确认：目标用户细分、业务现状、指标基线、交付时间和最终评审人。在获得证据前不虚构答案。
"""


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
