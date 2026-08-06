from pathlib import Path

build_script = Path("script/build_and_run.sh").read_text()
keychain_service = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Services/KeychainService.swift"
).read_text()
broker = Path(
    "apps/macos/AIEmployee/Sources/AIEmployeeCredentialBroker/main.swift"
).read_text()

assert "--sign -" not in build_script, "development builds must not use an ephemeral ad-hoc identity"
assert "AI Employee OS Local Development" in build_script, "a stable default signing identity is required"
assert "security find-identity" in build_script, "the signing identity must be validated before building"
assert "AIEmployeeCredentialBroker" in build_script, "Keychain access must use the stable signed credential broker"
assert "Security" not in keychain_service, "the frequently rebuilt main app must not access Keychain directly"
assert "credentials.v3" in broker and "credentials.v2" in broker, "the broker must own v3 and detect older items without reading them"
assert "read(previousService)" not in broker, "zero-prompt migration must never decrypt the old app-owned item"
assert "SecItemUpdate" in broker, "replacing a key must preserve the broker-owned access control"
