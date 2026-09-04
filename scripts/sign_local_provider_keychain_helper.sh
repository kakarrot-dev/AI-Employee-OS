#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
helper_path="$project_dir/build/native/provider-keychain-helper"
identity_name=${AI_EMPLOYEE_SIGNING_IDENTITY:-AI Employee OS Local Development}
credential_reader_identifier=com.kakarrot.ai-employee-os

identity_hash=$(
  security find-identity -v -p codesigning 2>/dev/null \
    | awk -v name="$identity_name" 'index($0, "\"" name "\"") { print $2; exit }'
)

if [ -z "$identity_hash" ]; then
  printf '%s\n' "缺少稳定的本地代码签名身份：$identity_name" >&2
  printf '%s\n' "Provider Keychain helper 不能使用 ad-hoc 签名，否则重建后会失去已有模型凭证的访问权。" >&2
  exit 1
fi

if [ ! -x "$helper_path" ]; then
  printf '%s\n' "缺少 Provider Keychain helper：$helper_path" >&2
  printf '%s\n' "请先运行 npm run build:native-memory。" >&2
  exit 1
fi

codesign --force \
  --sign "$identity_hash" \
  --identifier "$credential_reader_identifier" \
  --options runtime \
  "$helper_path"
codesign --verify --strict --verbose=2 "$helper_path"

printf '%s\n' "Provider Keychain helper 已使用稳定本地身份签名。"
