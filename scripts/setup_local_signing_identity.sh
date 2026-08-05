#!/usr/bin/env bash
set -euo pipefail

IDENTITY_NAME="AI Employee OS Local Development"
LOGIN_KEYCHAIN="$(/usr/bin/security default-keychain -d user \
  | /usr/bin/sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//')"

if /usr/bin/security find-identity -v -p codesigning | /usr/bin/grep -Fq "\"$IDENTITY_NAME\""; then
  echo "本地代码签名身份已就绪：$IDENTITY_NAME"
  exit 0
fi

TEMP_DIR="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ai-employee-signing.XXXXXX")"
/bin/chmod 700 "$TEMP_DIR"
trap '/bin/rm -rf "$TEMP_DIR"' EXIT

/usr/bin/openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
  -keyout "$TEMP_DIR/identity.key" \
  -out "$TEMP_DIR/identity.crt" \
  -days 3650 \
  -subj "/CN=$IDENTITY_NAME/O=AI Employee OS Local Development" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "subjectKeyIdentifier=hash"
/bin/chmod 600 "$TEMP_DIR/identity.key"
P12_PASSWORD="$(/usr/bin/openssl rand -hex 24)"

/usr/bin/openssl pkcs12 -export \
  -inkey "$TEMP_DIR/identity.key" \
  -in "$TEMP_DIR/identity.crt" \
  -name "$IDENTITY_NAME" \
  -passout "pass:$P12_PASSWORD" \
  -out "$TEMP_DIR/identity.p12"

/usr/bin/security import "$TEMP_DIR/identity.p12" \
  -k "$LOGIN_KEYCHAIN" \
  -P "$P12_PASSWORD" \
  -T /usr/bin/codesign
/usr/bin/security add-trusted-cert -d -r trustRoot -p codeSign \
  -k "$LOGIN_KEYCHAIN" "$TEMP_DIR/identity.crt"

if ! /usr/bin/security find-identity -v -p codesigning | /usr/bin/grep -Fq "\"$IDENTITY_NAME\""; then
  echo "签名身份已导入，但未被 macOS 识别为有效的代码签名身份。" >&2
  exit 1
fi

echo "已创建稳定的本地代码签名身份：$IDENTITY_NAME"
