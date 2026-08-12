from dataclasses import dataclass
import os


@dataclass(frozen=True)
class ProviderConfig:
    provider: str = "deepseek"
    deepseek_model: str = "deepseek-v4-flash"
    poe_model: str = "deepseek-v4-flash"
    request_timeout_seconds: float = 60.0
    scenario_request_timeout_seconds: float = 180.0
    fallback_enabled: bool = True

    def validate(self) -> None:
        if self.provider not in {"deepseek", "poe"}:
            raise ValueError("provider must be deepseek or poe")
        if not self.deepseek_model.strip():
            raise ValueError("deepseek_model must not be empty")
        if not self.poe_model.strip():
            raise ValueError("poe_model must not be empty")
        if not 1 <= self.request_timeout_seconds <= 300:
            raise ValueError("request_timeout_seconds must be between 1 and 300")
        if not 1 <= self.scenario_request_timeout_seconds <= 300:
            raise ValueError("scenario_request_timeout_seconds must be between 1 and 300")

    def public_dict(self) -> dict[str, object]:
        """Client-safe settings; credentials are intentionally not represented."""
        return {
            "provider": self.provider,
            "deepseek_model": self.deepseek_model,
            "poe_model": self.poe_model,
            "request_timeout_seconds": self.request_timeout_seconds,
            "scenario_request_timeout_seconds": self.scenario_request_timeout_seconds,
            "fallback_enabled": self.fallback_enabled,
        }

    @classmethod
    def from_environment(cls) -> "ProviderConfig":
        provider = os.getenv("AI_EMPLOYEE_MODEL_PROVIDER", "deepseek").strip().lower()
        model = os.getenv("AI_EMPLOYEE_MODEL", "").strip()
        return cls(
            provider=provider,
            deepseek_model=model if provider == "deepseek" and model else "deepseek-v4-flash",
            poe_model=model if provider == "poe" and model else "claude-sonnet-4.6",
        )

    @property
    def model(self) -> str:
        return self.poe_model if self.provider == "poe" else self.deepseek_model
