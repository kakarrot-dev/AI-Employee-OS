from pathlib import Path

root = Path(__file__).resolve().parents[1]
settings = (root / "apps/macos/AIEmployee/Sources/AIEmployee/Views/SettingsView.swift").read_text()
conversation = (root / "apps/macos/AIEmployee/Sources/AIEmployee/Stores/ConversationStore.swift").read_text()

assert "KeychainService.load" not in settings, "opening Settings must not read protected Keychain data"
assert "KeychainService.load" in conversation, "model requests must load the key at the execution boundary"
print("keychain boundaries: ok")
