#!/usr/bin/env python3
"""Deterministic Phase 0 spike for the local Provider proxy trust boundary.

This does not call Poe or DeepSeek. A local fake upstream proves that the Worker
only receives a short-lived local grant while the upstream credential remains in
the Provider process.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import http.client
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


FAKE_UPSTREAM_SECRET = "fake-upstream-secret-for-provider-process-only"
GRANT_SIGNING_KEY = b"runtime-only-grant-signing-key"
ALLOWED_TOOLS = {"submit_proposal"}


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_grant(*, expires_at: int | None = None) -> str:
    claims = {
        "run_id": "run-provider-spike",
        "provider": "probe",
        "model": "probe-model",
        "exp": expires_at or int(time.time()) + 60,
        "max_input_chars": 256,
        "max_output_tokens": 64,
    }
    encoded = b64url_encode(json_bytes(claims))
    signature = hmac.new(GRANT_SIGNING_KEY, encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{b64url_encode(signature)}"


def verify_grant(token: str) -> dict[str, Any]:
    try:
        encoded, supplied = token.split(".", 1)
        expected = hmac.new(
            GRANT_SIGNING_KEY, encoded.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, b64url_decode(supplied)):
            raise ValueError("invalid signature")
        claims = json.loads(b64url_decode(encoded))
    except (ValueError, json.JSONDecodeError) as error:
        raise PermissionError("invalid local grant") from error
    if claims["exp"] < int(time.time()):
        raise PermissionError("expired local grant")
    return claims


@dataclass(frozen=True)
class ProviderConfig:
    upstream_url: str
    upstream_secret: str
    allowed_models: frozenset[str]


class FakeUpstreamState:
    def __init__(self) -> None:
        self.authorized_requests = 0
        self.disconnect_observed = threading.Event()


class FakeUpstreamHandler(BaseHTTPRequestHandler):
    server_version = "FakeProvider/1"

    @property
    def state(self) -> FakeUpstreamState:
        return self.server.state  # type: ignore[attr-defined]

    def log_message(self, *_args: Any) -> None:
        return

    def send_json(self, status: int, body: dict[str, Any], **headers: str) -> None:
        payload = json_bytes(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for name, value in headers.items():
            self.send_header(name.replace("_", "-"), value)
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
        if self.headers.get("Authorization") != f"Bearer {FAKE_UPSTREAM_SECRET}":
            self.send_json(401, {"error": {"message": "bad upstream key"}})
            return
        self.state.authorized_requests += 1
        prompt = body["messages"][0]["content"]
        if prompt == "__429__":
            self.send_json(
                429,
                {"error": {"message": "secret-free upstream limit"}},
                Retry_After="3",
            )
            return
        if prompt == "__401__":
            self.send_json(401, {"error": {"message": "credential rejected"}})
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        chunks: list[dict[str, Any]]
        if prompt == "__cancel__":
            chunks = [
                {
                    "choices": [{"delta": {"content": str(index)}}],
                    "usage": None,
                }
                for index in range(40)
            ]
        elif prompt == "__tool__":
            chunks = [
                {
                    "choices": [
                        {
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call-1",
                                        "function": {
                                            "name": "submit_proposal",
                                            "arguments": '{"summary":',
                                        },
                                    }
                                ]
                            }
                        }
                    ]
                },
                {
                    "choices": [
                        {
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "function": {"arguments": '"ready"}'},
                                    }
                                ]
                            },
                            "finish_reason": "tool_calls",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 4,
                        "completion_tokens": 3,
                        "total_tokens": 7,
                    },
                },
            ]
        else:
            chunks = [
                {"choices": [{"delta": {"content": '{"ok":'}}]},
                {
                    "choices": [
                        {"delta": {"content": "true}"}, "finish_reason": "stop"}
                    ],
                    "usage": {
                        "prompt_tokens": 5,
                        "completion_tokens": 3,
                        "total_tokens": 8,
                    },
                },
            ]
        try:
            for chunk in chunks:
                self.wfile.write(b": keep-alive\n\n")
                self.wfile.write(b"data: " + json_bytes(chunk) + b"\n\n")
                self.wfile.flush()
                if prompt == "__cancel__":
                    time.sleep(0.05)
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            self.state.disconnect_observed.set()


class ProviderProxyState:
    def __init__(self, provider: ProviderConfig) -> None:
        self.provider = provider
        self.cancellations: dict[str, threading.Event] = {}
        self.lock = threading.Lock()
        self.audit_events: list[dict[str, Any]] = []

    def cancellation_for(self, request_id: str) -> threading.Event:
        with self.lock:
            return self.cancellations.setdefault(request_id, threading.Event())

    def finish(self, request_id: str) -> None:
        with self.lock:
            self.cancellations.pop(request_id, None)

    def audit(self, event: str, **fields: Any) -> None:
        self.audit_events.append({"event": event, **fields})


class ProviderProxyHandler(BaseHTTPRequestHandler):
    server_version = "LocalProviderProxy/1"

    @property
    def state(self) -> ProviderProxyState:
        return self.server.state  # type: ignore[attr-defined]

    def log_message(self, *_args: Any) -> None:
        return

    def send_json(self, status: int, body: dict[str, Any]) -> None:
        payload = json_bytes(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authenticate(self) -> dict[str, Any]:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise PermissionError("missing local grant")
        return verify_grant(header.removeprefix("Bearer "))

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length))

    def do_POST(self) -> None:  # noqa: N802
        try:
            claims = self.authenticate()
        except PermissionError as error:
            self.send_json(401, {"error": {"code": "invalid_local_grant", "message": str(error)}})
            return

        body = self.read_json()
        if self.path == "/v1/provider/cancel":
            request_id = body.get("request_id", "")
            self.state.cancellation_for(request_id).set()
            self.state.audit("request_cancelled", run_id=claims["run_id"], request_id=request_id)
            self.send_json(200, {"cancelled": True, "request_id": request_id})
            return
        if self.path != "/v1/provider/stream":
            self.send_json(404, {"error": {"code": "not_found"}})
            return
        self.handle_stream(claims, body)

    def handle_stream(self, claims: dict[str, Any], body: dict[str, Any]) -> None:
        allowed_fields = {"request_id", "input", "max_output_tokens", "tools", "output_schema"}
        unknown_fields = sorted(set(body) - allowed_fields)
        if unknown_fields:
            self.send_json(
                400,
                {"error": {"code": "unsupported_internal_field", "fields": unknown_fields}},
            )
            return
        if claims["provider"] != "probe" or claims["model"] not in self.state.provider.allowed_models:
            self.send_json(403, {"error": {"code": "model_not_allowed"}})
            return
        text = body.get("input", "")
        if not isinstance(text, str) or len(text) > claims["max_input_chars"]:
            self.send_json(403, {"error": {"code": "input_budget_exceeded"}})
            return
        max_output_tokens = body.get("max_output_tokens", 0)
        if not isinstance(max_output_tokens, int) or max_output_tokens > claims["max_output_tokens"]:
            self.send_json(403, {"error": {"code": "output_budget_exceeded"}})
            return
        tools = body.get("tools", [])
        tool_names = {tool.get("name") for tool in tools if isinstance(tool, dict)}
        if not tool_names <= ALLOWED_TOOLS:
            self.send_json(403, {"error": {"code": "tool_not_allowed"}})
            return

        request_id = body["request_id"]
        cancellation = self.state.cancellation_for(request_id)
        upstream_body = {
            "model": claims["model"],
            "messages": [{"role": "user", "content": text}],
            "max_tokens": max_output_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            upstream_body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": "submit_proposal",
                        "description": "Return a side-effect-free proposal",
                        "parameters": {
                            "type": "object",
                            "properties": {"summary": {"type": "string"}},
                            "required": ["summary"],
                            "additionalProperties": False,
                        },
                    },
                }
            ]

        self.state.audit(
            "request_started",
            run_id=claims["run_id"],
            request_id=request_id,
            provider=claims["provider"],
            model=claims["model"],
        )
        request = urllib.request.Request(
            self.state.provider.upstream_url,
            data=json_bytes(upstream_body),
            headers={
                "Authorization": f"Bearer {self.state.provider.upstream_secret}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        upstream = None
        try:
            upstream = urllib.request.urlopen(request, timeout=3)
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()
            tool_call: dict[str, str] = {"id": "", "name": "", "arguments": ""}
            content = ""
            while True:
                line = upstream.readline()
                if not line:
                    break
                if cancellation.is_set():
                    self.write_event({"type": "cancelled", "request_id": request_id})
                    self.state.audit("request_stopped", run_id=claims["run_id"], request_id=request_id)
                    return
                stripped = line.strip()
                if not stripped or stripped.startswith(b":"):
                    continue
                if not stripped.startswith(b"data: "):
                    continue
                raw_data = stripped.removeprefix(b"data: ")
                if raw_data == b"[DONE]":
                    break
                chunk = json.loads(raw_data)
                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                if delta.get("content"):
                    content += delta["content"]
                    self.write_event({"type": "output_delta", "text": delta["content"]})
                for call_delta in delta.get("tool_calls", []):
                    tool_call["id"] = call_delta.get("id", tool_call["id"])
                    function = call_delta.get("function", {})
                    tool_call["name"] = function.get("name", tool_call["name"])
                    tool_call["arguments"] += function.get("arguments", "")
                if chunk.get("usage"):
                    usage = chunk["usage"]
                    self.write_event(
                        {
                            "type": "usage",
                            "input_tokens": usage["prompt_tokens"],
                            "output_tokens": usage["completion_tokens"],
                            "total_tokens": usage["total_tokens"],
                            "source": "provider_actual",
                        }
                    )
            if tool_call["name"]:
                arguments = json.loads(tool_call["arguments"])
                if tool_call["name"] not in ALLOWED_TOOLS or not isinstance(arguments.get("summary"), str):
                    raise ValueError("invalid tool proposal")
                self.write_event(
                    {
                        "type": "tool_proposal",
                        "call_id": tool_call["id"],
                        "name": tool_call["name"],
                        "arguments": arguments,
                    }
                )
            if body.get("output_schema"):
                value = json.loads(content)
                if not isinstance(value, dict) or not isinstance(value.get("ok"), bool):
                    raise ValueError("structured result failed local schema validation")
                self.write_event({"type": "structured_result", "value": value})
            self.write_event({"type": "completed", "request_id": request_id})
            self.state.audit("request_completed", run_id=claims["run_id"], request_id=request_id)
        except urllib.error.HTTPError as error:
            provider_code = {
                401: "provider_authentication_failed",
                429: "provider_rate_limited",
            }.get(error.code, "provider_unavailable")
            retryable = error.code in {408, 429, 500, 502, 503, 529}
            self.send_json(
                502,
                {
                    "error": {
                        "code": provider_code,
                        "retryable": retryable,
                        "retry_after_seconds": int(error.headers.get("Retry-After", "0")),
                    }
                },
            )
            self.state.audit(
                "request_failed",
                run_id=claims["run_id"],
                request_id=request_id,
                code=provider_code,
            )
        except (ValueError, json.JSONDecodeError):
            self.write_event({"type": "failed", "code": "invalid_provider_output"})
            self.state.audit(
                "request_failed",
                run_id=claims["run_id"],
                request_id=request_id,
                code="invalid_provider_output",
            )
        finally:
            if upstream is not None:
                upstream.close()
            self.state.finish(request_id)

    def write_event(self, event: dict[str, Any]) -> None:
        self.wfile.write(json_bytes(event) + b"\n")
        self.wfile.flush()


class ManagedServer:
    def __init__(self, handler: type[BaseHTTPRequestHandler], state: Any) -> None:
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.server.state = state  # type: ignore[attr-defined]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def port(self) -> int:
        return self.server.server_address[1]

    def __enter__(self) -> ManagedServer:
        self.thread.start()
        return self

    def __exit__(self, *_args: Any) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def request_json(port: int, path: str, token: str, body: dict[str, Any]) -> tuple[int, Any]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    connection.request(
        "POST",
        path,
        body=json_bytes(body),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    response = connection.getresponse()
    payload = response.read()
    connection.close()
    parsed = json.loads(payload) if response.getheader("Content-Type") == "application/json" else payload.decode()
    return response.status, parsed


def worker_main() -> None:
    forbidden_names = {"POE_API_KEY", "DEEPSEEK_API_KEY", "UPSTREAM_API_KEY"}
    assert not forbidden_names & os.environ.keys()
    proxy_port = int(os.environ["LOCAL_PROVIDER_PORT"])
    token = os.environ["LOCAL_PROVIDER_GRANT"]
    status, body = request_json(
        proxy_port,
        "/v1/provider/stream",
        token,
        {
            "request_id": "worker-structured",
            "input": "structured",
            "max_output_tokens": 32,
            "output_schema": {
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
            },
        },
    )
    assert status == 200
    print(json.dumps({"status": status, "events": [json.loads(line) for line in body.splitlines()]}))


def run_spike() -> None:
    upstream_state = FakeUpstreamState()
    with ManagedServer(FakeUpstreamHandler, upstream_state) as upstream:
        provider = ProviderConfig(
            upstream_url=f"http://127.0.0.1:{upstream.port}/v1/chat/completions",
            upstream_secret=FAKE_UPSTREAM_SECRET,
            allowed_models=frozenset({"probe-model"}),
        )
        proxy_state = ProviderProxyState(provider)
        with ManagedServer(ProviderProxyHandler, proxy_state) as proxy:
            token = issue_grant()
            worker_env = {
                "PATH": os.environ.get("PATH", ""),
                "LOCAL_PROVIDER_PORT": str(proxy.port),
                "LOCAL_PROVIDER_GRANT": token,
            }
            completed = subprocess.run(
                [sys.executable, __file__, "worker"],
                check=True,
                capture_output=True,
                text=True,
                env=worker_env,
                timeout=10,
            )
            worker_report = json.loads(completed.stdout)
            worker_event_types = [event["type"] for event in worker_report["events"]]
            assert worker_event_types == [
                "output_delta",
                "output_delta",
                "usage",
                "structured_result",
                "completed",
            ]

            status, tool_stream = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {
                    "request_id": "tool-proposal",
                    "input": "__tool__",
                    "max_output_tokens": 32,
                    "tools": [{"name": "submit_proposal"}],
                },
            )
            assert status == 200
            tool_events = [json.loads(line) for line in tool_stream.splitlines()]
            assert any(event["type"] == "tool_proposal" for event in tool_events)
            assert any(event["type"] == "usage" and event["source"] == "provider_actual" for event in tool_events)

            status, rate_limit_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {"request_id": "rate-limit", "input": "__429__", "max_output_tokens": 8},
            )
            assert status == 502
            assert rate_limit_error["error"] == {
                "code": "provider_rate_limited",
                "retryable": True,
                "retry_after_seconds": 3,
            }

            status, authentication_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {
                    "request_id": "authentication",
                    "input": "__401__",
                    "max_output_tokens": 8,
                },
            )
            assert status == 502
            assert authentication_error["error"] == {
                "code": "provider_authentication_failed",
                "retryable": False,
                "retry_after_seconds": 0,
            }

            status, budget_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {
                    "request_id": "over-budget",
                    "input": "blocked",
                    "max_output_tokens": 65,
                },
            )
            assert status == 403 and budget_error["error"]["code"] == "output_budget_exceeded"

            status, tool_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {
                    "request_id": "unknown-tool",
                    "input": "blocked",
                    "max_output_tokens": 8,
                    "tools": [{"name": "shell"}],
                },
            )
            assert status == 403 and tool_error["error"]["code"] == "tool_not_allowed"

            status, target_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                token,
                {
                    "request_id": "arbitrary-target",
                    "input": "blocked",
                    "max_output_tokens": 8,
                    "base_url": "https://attacker.invalid",
                    "model": "unfrozen-model",
                },
            )
            assert status == 400
            assert target_error["error"]["fields"] == ["base_url", "model"]

            status, expired_error = request_json(
                proxy.port,
                "/v1/provider/stream",
                issue_grant(expires_at=int(time.time()) - 1),
                {"request_id": "expired", "input": "blocked", "max_output_tokens": 8},
            )
            assert status == 401 and expired_error["error"]["code"] == "invalid_local_grant"

            connection = http.client.HTTPConnection("127.0.0.1", proxy.port, timeout=5)
            connection.request(
                "POST",
                "/v1/provider/stream",
                body=json_bytes(
                    {"request_id": "cancel-me", "input": "__cancel__", "max_output_tokens": 32}
                ),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            response = connection.getresponse()
            first_event = json.loads(response.readline())
            assert first_event["type"] == "output_delta"
            status, cancel_body = request_json(
                proxy.port,
                "/v1/provider/cancel",
                token,
                {"request_id": "cancel-me"},
            )
            assert status == 200 and cancel_body["cancelled"] is True
            remaining = [json.loads(line) for line in response.read().splitlines()]
            connection.close()
            assert any(event["type"] == "cancelled" for event in remaining)
            upstream_state.disconnect_observed.wait(timeout=2)

            serialized_evidence = json.dumps(
                {
                    "worker": worker_report,
                    "audit": proxy_state.audit_events,
                    "rate_limit": rate_limit_error,
                }
            )
            assert FAKE_UPSTREAM_SECRET not in completed.stdout
            assert FAKE_UPSTREAM_SECRET not in completed.stderr
            assert FAKE_UPSTREAM_SECRET not in serialized_evidence
            assert upstream_state.authorized_requests >= 5

            result = {
                "worker_secret_names_present": False,
                "upstream_authorized_requests": upstream_state.authorized_requests,
                "structured_stream": "passed",
                "tool_proposal_and_usage": "passed",
                "error_normalization": "passed",
                "arbitrary_target_rejected": "passed",
                "expired_grant_rejected": "passed",
                "cancellation": "passed",
                "upstream_disconnect_observed": upstream_state.disconnect_observed.is_set(),
                "secret_absent_from_worker_and_audit": "passed",
            }
            print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "worker":
        worker_main()
    else:
        run_spike()
