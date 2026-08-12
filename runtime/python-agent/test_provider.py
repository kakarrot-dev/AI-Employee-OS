import unittest
from http.client import IncompleteRead
from unittest.mock import patch

from app.loop import (
    BoundedPlannerLoop,
    LoopLimitExceeded,
    LoopLimits,
    PlannerProtocolError,
    ToolExecutionStopped,
    ToolResultUnknown,
)
from app.provider import (
    DeterministicFakeProvider,
    ProviderErrorKind,
    ProviderFailure,
    ProviderRouter,
    DeepSeekProvider,
    HttpResponse,
    PoeProvider,
    UrllibTransport,
)


class FakeTransport:
    def __init__(self, response, stream_lines=None):
        self.response = response
        self.stream_lines = stream_lines or []
        self.calls = []

    def post(self, url, headers, payload, timeout):
        self.calls.append((url, headers, payload, timeout))
        return self.response

    def stream(self, url, headers, payload, timeout):
        self.calls.append((url, headers, payload, timeout))
        yield from self.stream_lines


class FakeGateway:
    def __init__(self):
        self.calls = []

    def execute(self, request):
        self.calls.append(request)
        return {
            "schema_version": "1.0",
            "call_id": request.call_id,
            "status": "succeeded",
            "side_effect_state": "confirmed",
            "output": {"path": "/approved/prd.md"},
        }


class ProviderRouterTests(unittest.TestCase):
    @patch("app.provider.request.urlopen")
    def test_transport_retries_interrupted_response_once_and_normalizes_error(self, urlopen):
        urlopen.side_effect = IncompleteRead(b"partial", 10)
        with self.assertRaisesRegex(ProviderFailure, "provider_response_interrupted") as raised:
            UrllibTransport().post("https://example.test", {}, {}, 1)
        self.assertEqual(raised.exception.kind, ProviderErrorKind.NETWORK)
        self.assertEqual(urlopen.call_count, 2)

    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "secret"})
    def test_deepseek_client_uses_chat_completions_without_exposing_key(self):
        transport = FakeTransport(HttpResponse(200, b'{"choices":[{"message":{"content":"ok"}}]}'))
        result = DeepSeekProvider("deepseek-v4-flash", 30, transport).complete([{"role": "user", "content": "hi"}])
        self.assertEqual(result.content, "ok")
        self.assertEqual(transport.calls[0][0], "https://api.deepseek.com/chat/completions")
        self.assertNotIn("secret", str(transport.calls[0][2]))

    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "secret"})
    def test_deepseek_json_completion_requests_json_object(self):
        transport = FakeTransport(HttpResponse(200, b'{"choices":[{"message":{"content":"{}"}}]}'))
        result = DeepSeekProvider("deepseek-v4-flash", 30, transport).complete_json(
            [{"role": "system", "content": "Return JSON"}]
        )
        self.assertEqual(result.content, "{}")
        self.assertEqual(transport.calls[0][2]["response_format"], {"type": "json_object"})

    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "secret"})
    def test_deepseek_rejects_truncated_json_completion(self):
        transport = FakeTransport(HttpResponse(
            200,
            b'{"choices":[{"finish_reason":"length","message":{"content":"{\\"type\\":\\"complete\\""}}]}'
        ))
        with self.assertRaisesRegex(ProviderFailure, "provider_output_truncated"):
            DeepSeekProvider("deepseek-v4-flash", 30, transport).complete_json(
                [{"role": "system", "content": "Return JSON"}]
            )

    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "secret"})
    def test_deepseek_stream_publishes_ordered_deltas_and_usage(self):
        transport = FakeTransport(HttpResponse(200, b""), [
            'data: {"choices":[{"delta":{"content":"你"}}]}\n'.encode(),
            'data: {"choices":[{"delta":{"content":"好"}}]}\n'.encode(),
            b'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n',
            b'data: [DONE]\n',
        ])
        deltas = []
        result = DeepSeekProvider("deepseek-v4-flash", 30, transport).stream_complete(
            [{"role": "user", "content": "hi"}], deltas.append
        )
        self.assertEqual(deltas, ["你", "好"])
        self.assertEqual((result.content, result.input_tokens, result.output_tokens), ("你好", 3, 2))
        self.assertTrue(transport.calls[0][2]["stream"])

    @patch.dict("os.environ", {"POE_API_KEY": "secret"})
    def test_poe_client_uses_openai_compatible_responses_api(self):
        body = b'{"output":[{"content":[{"type":"output_text","text":"fallback"}]}]}'
        transport = FakeTransport(HttpResponse(200, body))
        result = PoeProvider("deepseek-v4-flash", 30, transport).complete([{"role": "user", "content": "hi"}])
        self.assertEqual(result.content, "fallback")
        self.assertEqual(transport.calls[0][0], "https://api.poe.com/v1/responses")

    @patch.dict("os.environ", {"POE_API_KEY": "secret"})
    def test_poe_supports_json_and_ordered_chat_delta(self):
        body = b'{"output_text":"{\\"type\\":\\"complete\\"}","usage":{"input_tokens":3,"output_tokens":4}}'
        transport = FakeTransport(HttpResponse(200, body))
        provider = PoeProvider("claude-opus-4.8", 30, transport)
        self.assertEqual(provider.complete_json([]).content, '{"type":"complete"}')
        deltas = []
        response = provider.stream_complete([], deltas.append)
        self.assertEqual(deltas, ['{"type":"complete"}'])
        self.assertEqual((response.input_tokens, response.output_tokens), (3, 4))
        self.assertNotIn("secret", str(transport.calls[0][2]))

    def test_temporary_failure_uses_poe_fallback(self):
        router = ProviderRouter(
            DeterministicFakeProvider(failure=ProviderErrorKind.RATE_LIMITED),
            DeterministicFakeProvider(["FINAL: fallback result"]),
        )
        self.assertEqual(router.complete([]).content, "FINAL: fallback result")
        self.assertEqual(router.fallback_events, [ProviderErrorKind.RATE_LIMITED])

    def test_authentication_failure_does_not_fallback(self):
        router = ProviderRouter(
            DeterministicFakeProvider(failure=ProviderErrorKind.AUTHENTICATION),
            DeterministicFakeProvider(["must not run"]),
        )
        with self.assertRaises(ProviderFailure):
            router.complete([])

    def test_loop_is_deterministic_and_bounded(self):
        router = ProviderRouter(
            DeterministicFakeProvider(["plan", "FINAL: PRD ready"]),
            DeterministicFakeProvider(),
        )
        loop = BoundedPlannerLoop(router, LoopLimits(max_steps=2))
        self.assertEqual(loop.run("write a PRD"), "PRD ready")

        measured = BoundedPlannerLoop(
            ProviderRouter(
                DeterministicFakeProvider(["FINAL: measured"]),
                DeterministicFakeProvider(),
            ),
            LoopLimits(max_steps=1),
        ).run_with_metrics("write a PRD")
        self.assertEqual(measured.output, "measured")
        self.assertEqual(measured.steps, 1)
        self.assertEqual(measured.provider_calls, {"fake": 1})

        exhausted = BoundedPlannerLoop(
            ProviderRouter(
                DeterministicFakeProvider(["continue"]),
                DeterministicFakeProvider(),
            ),
            LoopLimits(max_steps=1),
        )
        with self.assertRaises(LoopLimitExceeded):
            exhausted.run("never finishes")

    def test_tool_loop_uses_gateway_observation_and_enforces_protocol(self):
        gateway = FakeGateway()
        router = ProviderRouter(
            DeterministicFakeProvider(
                [
                    '{"type":"tool_call","call_id":"call-1","action":"document.create_markdown","arguments":{"path":"prd.md"},"idempotency_key":"task-1:prd"}',
                    '{"type":"final","content":"PRD saved"}',
                ]
            ),
            DeterministicFakeProvider(),
        )
        result = BoundedPlannerLoop(router, LoopLimits(max_steps=2, max_tool_calls=1)).run_with_tools(
            "write a PRD", gateway
        )
        self.assertEqual(result.output, "PRD saved")
        self.assertEqual(result.tool_calls, 1)
        self.assertEqual(gateway.calls[0].idempotency_key, "task-1:prd")

        invalid = BoundedPlannerLoop(
            ProviderRouter(DeterministicFakeProvider(["not-json"]), DeterministicFakeProvider()),
            LoopLimits(max_steps=1),
        )
        with self.assertRaises(PlannerProtocolError):
            invalid.run_with_tools("task", gateway)

    def test_tool_loop_stops_on_unknown_result_and_rejects_duplicate_identity(self):
        class UnknownGateway:
            def execute(self, request):
                return {
                    "schema_version": "1.0",
                    "call_id": request.call_id,
                    "status": "result_unknown",
                    "side_effect_state": "unknown",
                }

        unknown = BoundedPlannerLoop(
            ProviderRouter(
                DeterministicFakeProvider([
                    '{"type":"tool_call","call_id":"call-1","action":"write","arguments":{},"idempotency_key":"task:write:1"}',
                    '{"type":"tool_call","call_id":"call-2","action":"write","arguments":{},"idempotency_key":"task:write:2"}',
                ]),
                DeterministicFakeProvider(),
            ),
            LoopLimits(max_steps=2, max_tool_calls=2),
        )
        with self.assertRaises(ToolResultUnknown):
            unknown.run_with_tools("task", UnknownGateway())

        class FailedAfterEffectGateway:
            def __init__(self):
                self.calls = 0

            def execute(self, request):
                self.calls += 1
                return {
                    "schema_version": "1.0",
                    "call_id": request.call_id,
                    "status": "failed",
                    "side_effect_state": "confirmed",
                }

        failed_gateway = FailedAfterEffectGateway()
        with self.assertRaises(ToolExecutionStopped):
            unknown.run_with_tools("task", failed_gateway)
        self.assertEqual(failed_gateway.calls, 1)

        class InvalidUnknownGateway:
            def execute(self, request):
                return {
                    "schema_version": "1.0",
                    "call_id": request.call_id,
                    "status": "failed",
                    "side_effect_state": "unknown",
                }

        invalid_unknown = BoundedPlannerLoop(
            ProviderRouter(
                DeterministicFakeProvider([
                    '{"type":"tool_call","call_id":"call-x","action":"write","arguments":{},"idempotency_key":"task:write:x"}'
                ]),
                DeterministicFakeProvider(),
            ),
            LoopLimits(max_steps=1, max_tool_calls=1),
        )
        with self.assertRaises(PlannerProtocolError):
            invalid_unknown.run_with_tools("task", InvalidUnknownGateway())

        duplicate = BoundedPlannerLoop(
            ProviderRouter(
                DeterministicFakeProvider([
                    '{"type":"tool_call","call_id":"call-1","action":"write","arguments":{},"idempotency_key":"task:write:1"}',
                    '{"type":"tool_call","call_id":"call-1","action":"write","arguments":{},"idempotency_key":"task:write:1"}',
                ]),
                DeterministicFakeProvider(),
            ),
            LoopLimits(max_steps=2, max_tool_calls=2),
        )
        with self.assertRaises(PlannerProtocolError):
            duplicate.run_with_tools("task", FakeGateway())


if __name__ == "__main__":
    unittest.main()
