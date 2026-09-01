# macOS 多进程安全边界 Phase 0 Spike

该 Spike 只在临时目录创建一个隔离 Keychain，不读取、不修改登录 Keychain，也不使用任何用户 Credential。它验证旧式 macOS Keychain Trusted Application ACL 的三个事实：

- 被 ACL 明确信任的已签名进程可以在禁用交互时读取测试 Secret。
- 不同签名进程不能静默读取同一项。
- 同一路径的二进制发生签名身份变化后，也不能继续静默读取。

运行：

```bash
./spikes/macos-process-security/run_keychain_acl_spike.sh
```

成功输出只报告断言结果，不打印测试 Secret。脚本退出时删除临时 Keychain 和编译产物。

## 证据边界

该实验使用 ad-hoc 签名和旧式文件 Keychain ACL，只用于复现“签名身份是授权边界”。正式产品不采用逐路径 Trusted Application ACL 共享 Secret，而应让各受控目标使用同一 Apple Developer Team 签发、各自独立 Bundle ID，并通过 `keychain-access-groups` 访问明确的共享组。正式发布还必须用 Developer ID、Hardened Runtime、公证和升级前后真实包做验证。

该实验不证明 Electron 主进程、Python 脚本解释器或任意第三方 CLI 可以成为可信 Secret 主体。Python Sidecar 必须冻结为独立、可签名、可核验的可执行目标；Worker 仍不得获得长期 Secret。

## 稳定本地签名升级实验

```bash
./spikes/macos-process-security/run_stable_signing_upgrade_spike.sh
```

该实验使用项目专用的 `AI Employee OS Local Development` 代码签名身份，在隔离临时 Keychain 上验证：同一 Bundle Identifier、同一稳定签名身份但二进制内容变化后仍可无交互读取；改成 ad-hoc 签名链后被拒绝。脚本不读取登录 Keychain 中的业务 Secret，也不输出测试 Secret；登录 Keychain 只用于完成临时测试二进制的签名。

这仍不是 Apple Development、Developer ID 或 Provisioning Profile 证据，不能关闭 Access Group、App Sandbox、公证或正式升级门禁。

## Apple Profile 真实升级矩阵

`run_apple_profile_upgrade_spike.sh` 是最终真实签名输入。它没有本地签名或 ad-hoc 回退；缺少任一 Apple 身份、Team ID 或 Profile 会直接失败。

```bash
AI_EMPLOYEE_OS_SIGNING_IDENTITY='Apple Development: ...' \
AI_EMPLOYEE_OS_TEAM_ID='TEAMID' \
AI_EMPLOYEE_OS_PROVIDER_PROFILE='/absolute/provider.provisionprofile' \
AI_EMPLOYEE_OS_RUNTIME_PROFILE='/absolute/runtime.provisionprofile' \
./spikes/macos-process-security/run_apple_profile_upgrade_spike.sh
```

Provider Profile 必须显式包含 `TEAMID.com.kakarrot.ai-employee-os.provider-secrets`，Runtime Profile 必须排除该组。脚本构建 Provider N、Provider N+1 和 Runtime 负例三个独立 App Bundle，使用 Data Protection Keychain：N 写入、N+1 无交互读取、Runtime 被拒绝，最后由 N+1 删除测试项。测试 Secret 是编译期固定夹具，不读取旧产品或用户 Credential，也不打印正文。

使用 Developer ID 时传入 `Developer ID Application: ...` 和对应 Developer ID Provisioning Profile；脚本额外启用 Hardened Runtime 与安全时间戳。公证、Staple、Gatekeeper 和正式 Electron/XPC 嵌套包仍属于 Phase 9 发布候选门禁。

## 网络权限实验

```bash
./spikes/macos-process-security/run_network_sandbox_spike.sh
```

该实验启动一个临时回环 TCP Server，用 macOS 已弃用的 `sandbox-exec` 证明 `deny network*` 能阻止测试进程访问回环端点，并验证两个 App Sandbox entitlement 模板的 Plist 语法。`sandbox-exec` 与 `sandbox_init` 已被系统手册标记为 Deprecated，因此本结果只作失败模型证据，不能进入产品 Runtime。

本轮曾尝试运行带 App Sandbox entitlement 的 ad-hoc 签名裸 CLI，但两个权限变体都在连接前被系统终止；没有 Provisioning Profile 和真实开发/发布身份的结果无效，已明确排除，不能据此声称 App Sandbox 运行时门禁通过。`no-network.plist` 和 `network-client.plist` 只定义后续真实签名包的测试输入。

Apple 官方说明 `com.apple.security.network.client` 只决定进程能否发起连接，不提供域名、IP 或端口 Allowlist。因此正式架构不能给 Worker `network.client` 再依赖应用层自律阻止公网访问。Worker 与 Runtime/Provider 的本地 IPC 应优先采用私有 XPC 或 Unix Domain Socket；只有 Provider 和具体 Network Runner 获得网络 Client 权限，并在进程内叠加固定 Origin、DNS Rebinding、重定向、预算和敏感信息检查。正式门禁必须用带 Provisioning Profile 的真实签名 App/XPC 包复验。
