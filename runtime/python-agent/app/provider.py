from dataclasses import dataclass
from enum import Enum
import json
import os
from typing import Callable, Iterator, Protocol
from urllib import error, request


class ProviderErrorKind(str, Enum):
    NETWORK = "network"
    RATE_LIMITED = "rate_limited"
    SERVER_TEMPORARY = "server_temporary"
    DEPENDENCY_UNAVAILABLE = "dependency_unavailable"
    AUTHENTICATION = "authentication"
    QUOTA = "quota"
    INVALID_REQUEST = "invalid_request"
    CONTENT_POLICY = "content_policy"
    INVALID_RESPONSE = "invalid_response"


FALLBACK_ALLOWED = {
    ProviderErrorKind.NETWORK,
    ProviderErrorKind.RATE_LIMITED,
    ProviderErrorKind.SERVER_TEMPORARY,
    ProviderErrorKind.DEPENDENCY_UNAVAILABLE,
}


@dataclass(frozen=True)
class ProviderResponse:
    content: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0


class ProviderFailure(Exception):
    def __init__(self, kind: ProviderErrorKind, message: str):
        super().__init__(message)
        self.kind = kind


class Provider(Protocol):
    name: str

    def complete(self, messages: list[dict[str, str]]) -> ProviderResponse: ...


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes


class Transport(Protocol):
    def post(self, url: str, headers: dict[str, str], payload: dict, timeout: float) -> HttpResponse: ...

    def stream(self, url: str, headers: dict[str, str], payload: dict, timeout: float) -> Iterator[bytes]: ...


class UrllibTransport:
    def post(self, url: str, headers: dict[str, str], payload: dict, timeout: float) -> HttpResponse:
        req = request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=timeout) as response:
                return HttpResponse(response.status, response.read())
        except error.HTTPError as exc:
            return HttpResponse(exc.code, exc.read())
        except (error.URLError, TimeoutError) as exc:
            raise ProviderFailure(ProviderErrorKind.NETWORK, str(exc)) from exc

    def stream(self, url: str, headers: dict[str, str], payload: dict, timeout: float) -> Iterator[bytes]:
        req = request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=timeout) as response:
                for line in response:
                    yield line
        except error.HTTPError as exc:
            _raise_http_error(HttpResponse(exc.code, exc.read()))
        except (error.URLError, TimeoutError) as exc:
            raise ProviderFailure(ProviderErrorKind.NETWORK, str(exc)) from exc


class DeepSeekProvider:
    name = "deepseek"

    def __init__(self, model: str, timeout: float, transport: Transport | None = None):
        self.model, self.timeout = model, timeout
        self.transport = transport or UrllibTransport()

    def complete(self, messages: list[dict[str, str]]) -> ProviderResponse:
        return self._complete(messages, json_object=False)

    def complete_json(self, messages: list[dict[str, str]]) -> ProviderResponse:
        return self._complete(messages, json_object=True)

    def _complete(self, messages: list[dict[str, str]], json_object: bool) -> ProviderResponse:
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ProviderFailure(ProviderErrorKind.AUTHENTICATION, "DEEPSEEK_API_KEY is not configured")
        payload = {"model": self.model, "messages": messages, "stream": False}
        if json_object:
            payload["response_format"] = {"type": "json_object"}
        response = self.transport.post(
            "https://api.deepseek.com/chat/completions",
            _headers(key),
            payload,
            self.timeout,
        )
        _raise_http_error(response)
        try:
            payload = json.loads(response.body)
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "invalid DeepSeek response") from exc
        if not isinstance(content, str):
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "missing DeepSeek content")
        usage = payload.get("usage", {})
        return ProviderResponse(
            content,
            self.name,
            _token_count(usage, "prompt_tokens", "input_tokens"),
            _token_count(usage, "completion_tokens", "output_tokens"),
        )

    def stream_complete(
        self,
        messages: list[dict[str, str]],
        on_delta: Callable[[str], None],
    ) -> ProviderResponse:
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ProviderFailure(ProviderErrorKind.AUTHENTICATION, "DEEPSEEK_API_KEY is not configured")
        chunks: list[str] = []
        input_tokens = 0
        output_tokens = 0
        for raw_line in self.transport.stream(
            "https://api.deepseek.com/chat/completions",
            _headers(key),
            {"model": self.model, "messages": messages, "stream": True, "stream_options": {"include_usage": True}},
            self.timeout,
        ):
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                payload = json.loads(data)
                choices = payload.get("choices") or []
                delta = choices[0].get("delta", {}).get("content") if choices else None
                if isinstance(delta, str) and delta:
                    chunks.append(delta)
                    on_delta(delta)
                usage = payload.get("usage") or {}
                input_tokens = _token_count(usage, "prompt_tokens", "input_tokens") or input_tokens
                output_tokens = _token_count(usage, "completion_tokens", "output_tokens") or output_tokens
            except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
                raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "invalid DeepSeek stream event") from exc
        content = "".join(chunks)
        if not content:
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "missing DeepSeek stream content")
        return ProviderResponse(content, self.name, input_tokens, output_tokens)


class PoeProvider:
    name = "poe"

    def __init__(self, model: str, timeout: float, transport: Transport | None = None):
        self.model, self.timeout = model, timeout
        self.transport = transport or UrllibTransport()

    def complete(self, messages: list[dict[str, str]]) -> ProviderResponse:
        key = os.getenv("POE_API_KEY")
        if not key:
            raise ProviderFailure(ProviderErrorKind.AUTHENTICATION, "POE_API_KEY is not configured")
        response = self.transport.post(
            "https://api.poe.com/v1/responses",
            _headers(key),
            {"model": self.model, "input": messages},
            self.timeout,
        )
        _raise_http_error(response)
        try:
            payload = json.loads(response.body)
            content = payload.get("output_text") or _poe_output_text(payload)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "invalid Poe response") from exc
        if not content:
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "missing Poe output text")
        usage = payload.get("usage", {})
        return ProviderResponse(
            content,
            self.name,
            _token_count(usage, "input_tokens", "prompt_tokens"),
            _token_count(usage, "output_tokens", "completion_tokens"),
        )


def _headers(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _raise_http_error(response: HttpResponse) -> None:
    if 200 <= response.status < 300:
        return
    mapping = {
        400: ProviderErrorKind.INVALID_REQUEST,
        401: ProviderErrorKind.AUTHENTICATION,
        402: ProviderErrorKind.QUOTA,
        403: ProviderErrorKind.CONTENT_POLICY,
        404: ProviderErrorKind.INVALID_REQUEST,
        408: ProviderErrorKind.SERVER_TEMPORARY,
        429: ProviderErrorKind.RATE_LIMITED,
        500: ProviderErrorKind.SERVER_TEMPORARY,
        502: ProviderErrorKind.DEPENDENCY_UNAVAILABLE,
        503: ProviderErrorKind.DEPENDENCY_UNAVAILABLE,
        529: ProviderErrorKind.SERVER_TEMPORARY,
    }
    raise ProviderFailure(mapping.get(response.status, ProviderErrorKind.INVALID_RESPONSE), f"provider HTTP {response.status}")


def _poe_output_text(payload: dict) -> str:
    parts: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    return "".join(parts)


def _token_count(usage: object, primary: str, alternate: str) -> int:
    if not isinstance(usage, dict):
        return 0
    value = usage.get(primary, usage.get(alternate, 0))
    return value if isinstance(value, int) and value >= 0 else 0


class ProviderRouter:
    def __init__(self, primary: Provider, fallback: Provider):
        self.primary = primary
        self.fallback = fallback
        self.fallback_events: list[ProviderErrorKind] = []

    def complete(self, messages: list[dict[str, str]]) -> ProviderResponse:
        try:
            return self.primary.complete(messages)
        except ProviderFailure as error:
            if error.kind not in FALLBACK_ALLOWED:
                raise
            self.fallback_events.append(error.kind)
            return self.fallback.complete(messages)


class DeterministicFakeProvider:
    name = "fake"

    def __init__(self, responses: list[str] | None = None, failure: ProviderErrorKind | None = None):
        self.responses = list(responses or ["done"])
        self.failure = failure

    def complete(self, messages: list[dict[str, str]]) -> ProviderResponse:
        if self.failure is not None:
            raise ProviderFailure(self.failure, "deterministic provider failure")
        if not self.responses:
            raise ProviderFailure(ProviderErrorKind.INVALID_RESPONSE, "no scripted response")
        return ProviderResponse(self.responses.pop(0), self.name)

    def complete_json(self, messages: list[dict[str, str]]) -> ProviderResponse:
        return self.complete(messages)
