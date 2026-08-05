from pathlib import Path

build_script = Path("script/build_and_run.sh").read_text()
keychain_service = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Services/KeychainService.swift"
).read_text()

assert "--sign -" not in build_script, "development builds must not use an ephemeral ad-hoc identity"
assert "AI Employee OS Local Development" in build_script, "a stable default signing identity is required"
assert "security find-identity" in build_script, "the signing identity must be validated before building"
assert "credentials.v2" in keychain_service, "legacy ad-hoc Keychain items require an explicit namespace migration"
assert "SecItemUpdate" in keychain_service, "replacing a key must preserve the existing item's access control"
