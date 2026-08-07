from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Callable


@dataclass(frozen=True)
class EvalCase:
    id: str
    input: dict
    expected_tool: str | None = None
    expected_error: str | None = None

    @property
    def category(self) -> str:
        return "tool_selection" if self.expected_tool else "expected_failure"


@dataclass(frozen=True)
class EvalCaseResult:
    case_id: str
    category: str
    score: float
    passed: bool
    output: str


@dataclass(frozen=True)
class EvalSuiteResult:
    cases: tuple[EvalCaseResult, ...]
    average_score: float
    passed: bool
    threshold: float

    def report(self, identity: dict[str, str]) -> dict:
        case_ids = [result.case_id for result in self.cases]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("eval report contains duplicate case ids")
        recomputed_average = sum(result.score for result in self.cases) / len(self.cases)
        recomputed_passed = [result.score >= self.threshold for result in self.cases]
        gate_passed = bool(self.cases) and all(recomputed_passed) and recomputed_average >= self.threshold
        if abs(recomputed_average - self.average_score) > 1e-12 or gate_passed != self.passed:
            raise ValueError("eval result summary is inconsistent with cases")
        categories: dict[str, dict[str, float | int]] = {}
        for result, passed in zip(self.cases, recomputed_passed, strict=True):
            category = categories.setdefault(result.category, {"total": 0, "passed": 0, "average_score": 0.0})
            category["total"] += 1
            category["passed"] += int(passed)
            category["average_score"] += result.score
        for category in categories.values():
            category["average_score"] /= category["total"]
        return {
            "schema_version": "1.0",
            "suite": {key: identity[key] for key in ("suite_id", "suite_version", "dataset_sha256")},
            "subject": {key: identity[key] for key in ("target_type", "target_id", "target_version", "target_sha256")},
            "summary": {
                "total": len(self.cases),
                "passed": sum(recomputed_passed),
                "average_score": recomputed_average,
                "threshold": self.threshold,
                "gate_passed": gate_passed,
            },
            "categories": categories,
            "failures": [
                {"case_id": result.case_id, "category": result.category, "score": result.score}
                for result in self.cases
                if result.score < self.threshold
            ],
        }


@dataclass(frozen=True)
class PrdRubricResult:
    score: float
    failed_items: tuple[str, ...]


def load_cases(path: Path) -> tuple[EvalCase, ...]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    cases = tuple(EvalCase(**item) for item in payload)
    if len(cases) < 2 or len({case.id for case in cases}) != len(cases):
        raise ValueError("eval suite requires at least 2 uniquely identified cases")
    suite = json.loads(path.with_name("suite.json").read_text(encoding="utf-8"))
    for case in cases:
        if bool(case.expected_tool) == bool(case.expected_error):
            raise ValueError(f"eval case {case.id} must declare exactly one expected outcome")
        if not isinstance(case.input, dict) or not case.input:
            raise ValueError(f"eval case {case.id} input must be a non-empty object")
    if suite.get("schema_version") != "1.0.0" or not suite.get("skill_id") or suite.get("cases") != path.name:
        raise ValueError("eval suite identity is invalid")
    return cases


def run_suite(
    cases: tuple[EvalCase, ...],
    generate: Callable[[dict], str],
    evaluate: Callable[[EvalCase, str], float],
    threshold: float = 0.8,
) -> EvalSuiteResult:
    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0 and 1")
    results: list[EvalCaseResult] = []
    for case in cases:
        output = generate(case.input)
        score = evaluate(case, output)
        if not 0.0 <= score <= 1.0:
            raise ValueError(f"invalid score for {case.id}")
        results.append(EvalCaseResult(case.id, case.category, score, score >= threshold, output))
    average = sum(result.score for result in results) / len(results) if results else 0.0
    return EvalSuiteResult(
        cases=tuple(results),
        average_score=average,
        passed=bool(results) and average >= threshold and all(result.passed for result in results),
        threshold=threshold,
    )


def evaluate_prd_artifact(content: str) -> PrdRubricResult:
    """Evaluate the frozen eight-item PRD rubric against a written artifact."""
    checks = {
        "evidence_traceable": _contains(content, "## 1.", "来源"),
        "user_value_clear": _contains(content, "## 2.", "用户价值"),
        "measurable_goal": _contains(content, "## 3.")
        and re.search(r"\d+(?:\.\d+)?(?:%|天|小时|分钟|秒|个)", content) is not None,
        "scope_clear": _contains(content, "## 4.", "范围", "非范围"),
        "recovery_flow": _contains(content, "## 5.", "正常")
        and _contains(content, "## 7.", "异常", "恢复"),
        "permission_boundary": _contains(content, "## 6.", "权限", "数据边界"),
        "testable_acceptance": _contains(content, "## 8.", "Given", "When", "Then"),
        "unknowns_not_fabricated": _contains(content, "## 9.", "待确认"),
    }
    failed = tuple(name for name, passed in checks.items() if not passed)
    return PrdRubricResult((len(checks) - len(failed)) / len(checks), failed)


def _contains(content: str, *needles: str) -> bool:
    return all(needle in content for needle in needles)
