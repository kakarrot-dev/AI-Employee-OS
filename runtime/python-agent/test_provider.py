import unittest
from unittest.mock import patch

from app.loop import BoundedPlannerLoop, LoopLimitExceeded, LoopLimits, PlannerProtocolError
from app.provider import (
    DeterministicFakeProvider,
    ProviderErrorKind,
    ProviderFailure,
    ProviderRouter,
    DeepSeekProvider,
    HttpResponse,
    PoeProvider,
)


class FakeTransport:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, headers, payload, timeout):
        self.calls.append((url, headers, payload, timeout))
        return self.response


class FakeGateway:
    def __init__(self):
        self.calls = []

    def execute(self, request):
        self.calls.append(request)
        return {"status": "succeeded", "output": {"path": "/approved/prd.md"}}


class ProviderRouterTests(unittest.TestCase):
    @patch.dict("os.environ", {"DEEPSEEK_API_KEY": "secret"})
    def test_deepseek_client_uses_chat_completions_without_exposing_key(self):
        transport = FakeTransport(HttpResponse(200, b'{"choices":[{"message":{"content":"ok"}}]}'))
        result = DeepSeekProvider("deepseek-v4-flash", 30, transport).complete([{"role": "user", "content": "hi"}])
        self.assertEqual(result.content, "ok")
        self.assertEqual(transport.calls[0][0], "https://api.deepseek.com/chat/completions")
        self.assertNotIn("secret", str(transport.calls[0][2]))

    @patch.dict("os.environ", {"POE_API_KEY": "secret"})
    def test_poe_client_uses_openai_compatible_responses_api(self):
        body = b'{"output":[{"content":[{"type":"output_text","text":"fallback"}]}]}'
        transport = FakeTransport(HttpResponse(200, body))
        result = PoeProvider("deepseek-v4-flash", 30, transport).complete([{"role": "user", "content": "hi"}])
        self.assertEqual(result.content, "fallback")
        self.assertEqual(transport.calls[0][0], "https://api.poe.com/v1/responses")

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


if __name__ == "__main__":
    unittest.main()
