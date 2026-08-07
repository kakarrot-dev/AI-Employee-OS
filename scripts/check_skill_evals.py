#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime/python-agent"))

from app.eval_runner import load_cases


def main() -> None:
    suites = sorted((ROOT / "packages/skills").glob("*/evals/cases.json"))
    if not suites:
        raise SystemExit("no Skill eval suites found")
    total = 0
    for path in suites:
        cases = load_cases(path)
        total += len(cases)
        print(f"{path.parent.parent.name}: {len(cases)} eval cases valid")
    print(f"skill eval assets: {len(suites)} suites, {total} cases ok")


if __name__ == "__main__":
    main()
