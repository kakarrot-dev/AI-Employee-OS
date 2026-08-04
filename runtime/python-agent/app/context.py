from dataclasses import dataclass, field
from hashlib import sha256


SECTION_ORDER = ("identity", "persona", "skill", "memory", "knowledge", "tool")


@dataclass(frozen=True)
class ContextItem:
    id: str
    content: str
    source_uri: str | None = None

    def as_contract(self) -> dict:
        if not self.id or not self.content:
            raise ValueError("context item id and content are required")
        return {
            "id": self.id,
            "content": self.content,
            "content_hash": sha256(self.content.encode()).hexdigest(),
            "source_uri": self.source_uri,
        }


@dataclass(frozen=True)
class ContextSection:
    kind: str
    items: tuple[ContextItem | str, ...]
    max_items: int
    trust: str = "trusted"

    def bounded(self) -> tuple[ContextItem | str, ...]:
        if self.max_items < 0:
            raise ValueError("max_items must be non-negative")
        return self.items[: self.max_items]


@dataclass(frozen=True)
class PromptRef:
    id: str
    version: str
    content: str

    def as_contract(self) -> dict:
        if not self.id or not self.version or not self.content:
            raise ValueError("prompt identity, version, and content are required")
        return {
            "id": self.id,
            "version": self.version,
            "sha256": sha256(self.content.encode()).hexdigest(),
            "content": self.content,
        }


@dataclass(frozen=True)
class WorkerRequest:
    schema_version: str
    task_id: str
    agent_id: str
    task_input: str
    trace_id: str
    context: tuple[ContextSection, ...] = field(default_factory=tuple)

    def validate(self) -> None:
        if self.schema_version != "1.0":
            raise ValueError("unsupported schema_version")
        kinds = [section.kind for section in self.context]
        if len(kinds) != len(set(kinds)) or not set(kinds) <= set(SECTION_ORDER):
            raise ValueError("context sections must be unique and typed")
        for section in self.context:
            if section.trust not in {"trusted", "untrusted_data"}:
                raise ValueError("unknown context trust level")
            if section.kind == "knowledge" and section.trust != "untrusted_data":
                raise ValueError("knowledge must be treated as untrusted data")


def build_decision_context(
    request: WorkerRequest,
    prompt: PromptRef,
    max_chars: int,
) -> dict:
    request.validate()
    sections = []
    for section in sorted(request.context, key=lambda value: SECTION_ORDER.index(value.kind)):
        if len(section.items) > section.max_items:
            raise ValueError(f"{section.kind} section exceeds max_items")
        items = []
        for raw_item in section.items:
            item = raw_item if isinstance(raw_item, ContextItem) else ContextItem(raw_item, raw_item)
            if not item.id or len(item.id) > 128 or not item.content or len(item.content) > 4_000:
                raise ValueError("context item identity or content is invalid")
            if item.source_uri is not None and len(item.source_uri) > 512:
                raise ValueError("context item source is too long")
            if section.kind == "knowledge" and item.source_uri is None:
                raise ValueError("knowledge item requires source_uri")
            items.append(item.as_contract())
        sections.append({"kind": section.kind, "trust": section.trust, "items": items})
    result = {
        "schema_version": "1.0",
        "prompt": prompt.as_contract(),
        "task": {"id": request.task_id, "input": request.task_input},
        "budget": {"max_chars": max_chars, "used_chars": 0},
        "sections": sections,
    }
    result["budget"]["used_chars"] = measured_chars(result)
    if result["budget"]["used_chars"] > max_chars:
        raise ValueError("decision context exceeds its budget")
    return result


def measured_chars(context: dict) -> int:
    prompt = context["prompt"]
    task = context["task"]
    total = sum(len(value) for value in (
        context["schema_version"], prompt["id"], prompt["version"], prompt["sha256"],
        prompt["content"], task["id"], task["input"],
    ))
    for section in context["sections"]:
        total += len(section["kind"]) + len(section["trust"])
        for item in section["items"]:
            total += len(item["id"]) + len(item["content"]) + len(item["content_hash"])
            total += len(item["source_uri"] or "")
    return total
