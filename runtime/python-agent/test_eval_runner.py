import unittest
import hashlib
from pathlib import Path

from app.eval_runner import evaluate_prd_artifact, load_cases, run_suite


class EvalRunnerTests(unittest.TestCase):
    def setUp(self):
        self.cases = load_cases(
            Path(__file__).parents[2] / "packages/skills/prd-generation/evals/cases.json"
        )

    def test_runs_every_fixed_case_and_requires_each_case_to_pass(self):
        result = run_suite(
            self.cases,
            lambda prompt: f"PRD: {prompt}",
            lambda case, output: 1.0 if output.startswith("PRD:") else 0.0,
        )
        self.assertEqual(len(result.cases), 12)
        self.assertTrue(result.passed)
        report = result.report({
            "suite_id": "prd-generation", "suite_version": "1.0.0",
            "dataset_sha256": hashlib.sha256(b"dataset").hexdigest(),
            "target_type": "skill", "target_id": "prd-generation",
            "target_version": "1.0.0", "target_sha256": hashlib.sha256(b"target").hexdigest(),
        })
        self.assertEqual(report["summary"]["total"], 12)
        self.assertEqual(report["categories"]["standard"]["passed"], 4)
        self.assertEqual(report["failures"], [])

        first_id = self.cases[0].id
        blocked = run_suite(
            self.cases,
            lambda prompt: prompt,
            lambda case, output: 0.75 if case.id == first_id else 1.0,
        )
        self.assertFalse(blocked.passed)

        forged = type(result)(result.cases, 0.5, True, result.threshold)
        with self.assertRaises(ValueError):
            forged.report({
                "suite_id": "prd-generation", "suite_version": "1.0.0", "dataset_sha256": "a" * 64,
                "target_type": "skill", "target_id": "prd-generation", "target_version": "1.0.0",
                "target_sha256": "b" * 64,
            })

    def test_prd_rubric_is_structural_and_reports_missing_items(self):
        complete = """# 产品需求文档
## 1. 背景与证据\n来源：输入需求
## 2. 用户问题\n用户价值明确
## 3. 产品目标与指标\n错误率低于 1%
## 4. 范围与非范围\n范围；非范围
## 5. 用户流程\n正常路径
## 6. 功能与权限设计\n权限与数据边界
## 7. 异常与恢复\n异常路径与恢复步骤
## 8. 验收标准\nGiven 条件 When 操作 Then 结果
## 9. 风险与待确认项\n待确认：指标基线
"""
        self.assertEqual(evaluate_prd_artifact(complete).score, 1.0)
        incomplete = evaluate_prd_artifact("# 产品需求文档")
        self.assertEqual(incomplete.score, 0.0)
        self.assertIn("evidence_traceable", incomplete.failed_items)


if __name__ == "__main__":
    unittest.main()
