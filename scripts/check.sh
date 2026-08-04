#!/usr/bin/env bash
set -euo pipefail

cargo fmt --all --check
cargo test --workspace
cargo build --bin tool-gateway
python3 scripts/check_contracts.py
PYTHONPATH=runtime/python-agent python3 -m unittest discover -s runtime/python-agent -p 'test_*.py'
