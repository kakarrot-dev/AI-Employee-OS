#!/usr/bin/env python3
"""Fetch and reduce Poe's public model catalog without using a credential."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CATALOG_URL = "https://api.poe.com/v1/models"
POE_ALLOWLIST = (
    ("claude-sonnet-4.6", "supervisor_text", "/v1/responses", True),
    ("gpt-image-2", "image_generation", "/v1/chat/completions", False),
    ("seedance-2.0", "video_generation", "/v1/chat/completions", False),
)


def fetch_catalog(retries: int = 3) -> bytes:
    last_error: Exception | None = None
    request = urllib.request.Request(
        CATALOG_URL,
        headers={"Accept": "application/json", "User-Agent": "ai-employee-os-phase-0/1"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"unexpected HTTP status: {response.status}")
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1 << attempt)
    raise RuntimeError(f"failed to fetch Poe model catalog after {retries} attempts") from last_error


def is_text_responses_tool_model(model: dict[str, Any]) -> bool:
    architecture = model.get("architecture") or {}
    return (
        "text" in architecture.get("input_modalities", [])
        and "text" in architecture.get("output_modalities", [])
        and "/v1/responses" in model.get("supported_endpoints", [])
        and "tools" in model.get("supported_features", [])
    )


def project_model(model: dict[str, Any]) -> dict[str, Any]:
    context_window = model.get("context_window") or {}
    pricing = model.get("pricing") or {}
    return {
        "id": model["id"],
        "owned_by": model.get("owned_by"),
        "context_length": context_window.get("context_length", model.get("context_length")),
        "max_output_tokens": context_window.get("max_output_tokens"),
        "supported_endpoints": model.get("supported_endpoints", []),
        "supported_features": model.get("supported_features", []),
        "reasoning": model.get("reasoning"),
        "parameters": [
            {
                key: parameter[key]
                for key in ("name", "schema", "default_value")
                if key in parameter
            }
            for parameter in model.get("parameters", [])
        ],
        "catalog_pricing_usd_per_token": {
            key: pricing.get(key)
            for key in ("prompt", "completion", "input_cache_read", "input_cache_write")
            if pricing.get(key) is not None
        },
    }


def reduce_catalog(raw: bytes, retrieved_at: str) -> dict[str, Any]:
    payload = json.loads(raw)
    models = payload.get("data")
    if payload.get("object") != "list" or not isinstance(models, list):
        raise ValueError("unexpected Poe model catalog shape")

    by_id = {model["id"]: model for model in models}
    missing = [model_id for model_id, _, _, _ in POE_ALLOWLIST if model_id not in by_id]
    if missing:
        raise ValueError(f"shortlist models missing from current catalog: {', '.join(missing)}")

    endpoint_counts: Counter[str] = Counter()
    feature_counts: Counter[str] = Counter()
    owner_counts: Counter[str] = Counter()
    for model in models:
        endpoint_counts.update(model.get("supported_endpoints", []))
        feature_counts.update(model.get("supported_features", []))
        owner_counts.update([model.get("owned_by") or "unknown"])

    strict_candidates = [model for model in models if is_text_responses_tool_model(model)]
    tools_without_endpoint_metadata = [
        model["id"]
        for model in models
        if "tools" in model.get("supported_features", [])
        and not model.get("supported_endpoints")
    ]
    return {
        "schema_version": 1,
        "retrieved_at": retrieved_at,
        "source": CATALOG_URL,
        "credential_used": False,
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "model_count": len(models),
        "strict_candidate_definition": {
            "input_modality": "text",
            "output_modality": "text",
            "required_endpoint": "/v1/responses",
            "required_feature": "tools",
        },
        "strict_candidate_count": len(strict_candidates),
        "endpoint_counts": dict(endpoint_counts.most_common()),
        "feature_counts": dict(feature_counts.most_common()),
        "owner_counts": dict(owner_counts.most_common()),
        "poe_allowlist": [
            {
                **project_model(by_id[model_id]),
                "product_role": product_role,
                "adapter_endpoint": adapter_endpoint,
                "stream": stream,
                "verification_status": "unverified",
            }
            for model_id, product_role, adapter_endpoint, stream in POE_ALLOWLIST
        ],
        "poe_allowlist_policy": (
            "Only these exact IDs may be configured. Text and media use separate adapters; "
            "image and video requests are non-streaming."
        ),
        "excluded_dynamic_router": {
            "id": "assistant",
            "reason": "Poe dynamically selects an underlying model, so the exact model cannot be frozen.",
        },
        "tools_without_endpoint_metadata_count": len(tools_without_endpoint_metadata),
        "evidence_boundary": (
            "Public catalog metadata only. It does not prove account access, runtime behavior, "
            "quality, points cost, or exact-model compatibility."
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="Analyze an existing raw catalog JSON file")
    parser.add_argument(
        "--retrieved-at",
        help="ISO-8601 timestamp for cached input; defaults to the current UTC time",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    raw = args.input.read_bytes() if args.input else fetch_catalog()
    retrieved_at = args.retrieved_at or datetime.now(timezone.utc).isoformat()
    result = reduce_catalog(raw, retrieved_at)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
