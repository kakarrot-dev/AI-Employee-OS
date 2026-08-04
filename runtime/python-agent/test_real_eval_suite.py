import json
from pathlib import Path
import tempfile
import unittest

from app.eval_runner import evaluate_prd_artifact, load_cases, run_suite
from app.gateway import GatewayContext, SubprocessToolGateway, ToolRoute
from app.loop import BoundedPlannerLoop, LoopLimits
from app.provider import DeterministicFakeProvider, ProviderResponse, ProviderRouter
from test_support.runtime_fixture import execution_count, seed_document_runtime


ROOT = Path(__file__).parents[2]
CASES_PATH = ROOT / "packages/skills/prd-generation/evals/cases.json"
GATEWAY_BINARY = ROOT / "target/debug/tool-gateway"


class ArtifactProvider:
    name = "deterministic-eval"

    def __init__(self, call):
        self.call = call
        self.observation = None

    def complete(self, messages):
        if len(messages) == 1:
            return ProviderResponse(json.dumps(self.call, ensure_ascii=False), self.name)
        self.observation = json.loads(messages[-1]["content"])
        return ProviderResponse(
            json.dumps({"type": "final", "content": self.observation["status"]}),
            self.name,
        )


class RealRuntimeEvalSuiteTests(unittest.TestCase):
    def test_all_fixed_cases_use_rust_tool_executor_and_real_artifacts(self):
        cases = load_cases(CASES_PATH)
        by_input = {case.input: case for case in cases}
        outputs = {}

        def generate(prompt):
            case = by_input[prompt]
            outputs[case.id] = self._run_case(case)
            return outputs[case.id]

        def evaluate(case, output):
            if case.id == "tool-01":
                result = json.loads(output)
                return float(
                    result["status"] == "blocked"
                    and result["error_code"] == "APPROVAL_REQUIRED"
                    and not result["artifact_exists"]
                )
            if case.id == "tool-02":
                result = json.loads(output)
                return float(
                    result["status"] == "result_unknown"
                    and result["side_effect_state"] == "unknown"
                    and result["execution_count"] == 1
                )
            rubric = evaluate_prd_artifact(output)
            return rubric.score if _meets_case_expectation(case.id, output) else min(rubric.score, 0.75)

        suite = run_suite(cases, generate, evaluate)
        self.assertEqual(len(suite.cases), 12)
        self.assertEqual(suite.average_score, 1.0)
        self.assertTrue(suite.passed)

    def _run_case(self, case):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            database = root / "runtime.sqlite3"
            task_id = f"task-{case.id}"
            action_id = f"action-{case.id}"
            approval_id = None if case.id == "tool-01" else f"approval-{case.id}"
            seed_document_runtime(root, database, task_id, action_id, approval_id)

            artifact = root / f"{case.id}.md"
            if case.id == "tool-02":
                artifact.mkdir()
            content = _prd_content(case.id, case.input)
            provider = ArtifactProvider(
                {
                    "type": "tool_call",
                    "call_id": f"call-{case.id}",
                    "action": "create_markdown",
                    "arguments": {"path": str(artifact), "content": content},
                    "idempotency_key": f"{task_id}:{action_id}:1",
                }
            )
            gateway = SubprocessToolGateway(
                GATEWAY_BINARY,
                database,
                GatewayContext(
                    task_id=task_id,
                    agent_id="ai-product-manager",
                    deadline="2099-01-01T00:00:00Z",
                    trace_id=f"trace-{case.id}",
                    routes={
                        "create_markdown": ToolRoute(
                            action_id,
                            "document-tool",
                            "1.0.0",
                            (f"grant-{task_id}",),
                            approval_id,
                        )
                    },
                ),
            )
            BoundedPlannerLoop(
                ProviderRouter(provider, DeterministicFakeProvider()),
                LoopLimits(max_steps=2, max_tool_calls=1),
            ).run_with_tools(case.input, gateway)
            observation = provider.observation
            if observation["status"] == "succeeded":
                return artifact.read_text(encoding="utf-8")
            return json.dumps(
                {
                    "status": observation["status"],
                    "error_code": observation["error"]["code"],
                    "side_effect_state": observation["side_effect_state"],
                    "artifact_exists": artifact.is_file(),
                    "execution_count": execution_count(database),
                }
            )


def _prd_content(case_id, task_input):
    special = {
        "standard-01": "权限采用最小授权；核心指标为越权事件 0 个。",
        "standard-02": "范围包含关键词搜索；非范围不包含实时网页抓取。",
        "standard-03": "审批被拒绝或过期时停止执行，并允许重新提交。",
        "standard-04": "历史页验收覆盖筛选结果和终态展示。",
        "missing-01": "待确认：目标用户、现状问题和成功口径，确认前不虚构方案。",
        "missing-02": "待确认：转化率基线、统计口径和目标值。",
        "missing-03": "待确认：企业角色、权限矩阵和数据边界。",
        "conflict-01": "来源 A 要求审批，来源 B 不要求；标记冲突并请求用户裁决。",
        "conflict-02": "来源 A 与来源 B 的留存指标冲突，保留双方来源并请求裁决。",
        "memory-01": "新旧偏好冲突，必须由用户显式解决后再写入 Memory。",
    }.get(case_id, "待确认：失败处理结果。")
    return f"""# 产品需求文档

## 1. 背景与证据
来源：本次输入需求“{task_input}”。{special}

## 2. 用户问题
用户无法稳定完成目标任务。用户价值是以可追踪、可恢复的方式获得结果。

## 3. 产品目标与指标
目标：任务成功率达到 95%，错误恢复时间小于 5 分钟。

## 4. 范围与非范围
范围：完成本案例要求。非范围：实时网页抓取、多 Agent 和云同步。

## 5. 用户流程
正常路径：输入需求、确认计划、获得结果。

## 6. 功能与权限设计
权限遵循最小授权；数据边界限制在用户授权目录。

## 7. 异常与恢复
异常时显示真实状态；恢复时不得重复产生副作用。

## 8. 验收标准
Given 已授权目录，When 用户运行任务，Then 系统返回可追踪结果且只执行 1 次副作用。

## 9. 风险与待确认项
待确认：业务指标基线和最终裁决。{special}
"""


def _meets_case_expectation(case_id, content):
    requirements = {
        "standard-01": ("最小授权", "越权事件", "Given"),
        "standard-02": ("范围包含关键词搜索", "非范围"),
        "standard-03": ("拒绝", "过期", "重新提交"),
        "standard-04": ("历史页验收", "Given", "Then"),
        "missing-01": ("目标用户", "不虚构"),
        "missing-02": ("转化率基线", "统计口径", "目标值"),
        "missing-03": ("企业角色", "权限矩阵", "数据边界"),
        "conflict-01": ("来源 A", "来源 B", "请求用户裁决"),
        "conflict-02": ("指标冲突", "保留双方来源", "请求裁决"),
        "memory-01": ("新旧偏好冲突", "用户显式解决", "Memory"),
    }
    return all(fragment in content for fragment in requirements[case_id])


if __name__ == "__main__":
    unittest.main()
