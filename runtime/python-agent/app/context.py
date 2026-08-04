from dataclasses import dataclass, field


@dataclass(frozen=True)
class ContextSection:
    kind: str
    items: tuple[str, ...]
    max_items: int

    def bounded(self) -> tuple[str, ...]:
        if self.max_items < 0:
            raise ValueError("max_items must be non-negative")
        return self.items[: self.max_items]


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
        allowed = {"identity", "persona", "skill", "memory", "knowledge", "tool"}
        if len(kinds) != len(set(kinds)) or not set(kinds) <= allowed:
            raise ValueError("context sections must be unique and typed")
