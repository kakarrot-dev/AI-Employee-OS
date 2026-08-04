from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Callable


@dataclass(frozen=True)
class EvalCase:
    id: str
    category: str
    input: str
    expected: str


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


@dataclass(frozen=True)
class PrdRubricResult:
    score: float
    failed_items: tuple[str, ...]


def load_cases(path: Path) -> tuple[EvalCase, ...]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    cases = tuple(EvalCase(**item) for item in payload)
    if len(cases) < 12 or len({case.id for case in cases}) != len(cases):
        raise ValueError("eval suite requires at least 12 uniquely identified cases")
    return cases


def run_suite(
    cases: tuple[EvalCase, ...],
    generate: Callable[[str], str],
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
