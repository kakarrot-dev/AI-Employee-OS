from pathlib import Path

root = Path(__file__).resolve().parents[1]
settings = (root / "apps/macos/AIEmployee/Sources/AIEmployee/Views/SettingsView.swift").read_text()
service = (root / "apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift").read_text()
configuration = (root / "apps/macos/AIEmployee/Sources/AIEmployee/Models/ModelConfiguration.swift").read_text()

assert "SecureField" not in settings and "KeychainService" not in settings, "Settings must not expose model credentials"
assert 'appending(path: ".env")' in configuration, "model configuration must come from .env"
assert "ModelConfiguration.environment()" in service, "model requests must load .env at the execution boundary"
print("model credential boundaries: ok")
