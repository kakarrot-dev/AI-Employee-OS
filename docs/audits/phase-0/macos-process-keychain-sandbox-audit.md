# Phase 0：macOS 多进程 Keychain、签名与网络沙箱审计

审计日期：2026-08-31

审计环境：macOS 26.6.2，Apple Silicon

范围：Electron Client、Local Control Runtime、Deep Agents Worker、Provider、Memory、Tool/MCP Runner 的进程身份、Secret 访问、本地 IPC、网络出站、开发/发布签名与升级

可执行证据：[`spikes/macos-process-security`](../../../spikes/macos-process-security/README.md)

## 1. 结论

**本地开发 Go；真实 Apple 签名包属于 Phase 9 发布门禁。**

- **Go：** 每个可执行主体必须成为独立签名目标；长期 Secret 按用途拆分 Keychain Access Group，只授予真正消费该 Secret 的 Provider、Memory 或 MCP Credential Service。
- **Go：** Worker 不再通过 TCP 回环地址直连 Provider。目标链路改为 `Worker → Runtime 私有 Pipe/Unix Domain Socket → Provider XPC/签名 Helper → 固定公网 Origin`，使 Worker 可以没有网络 Client 权限。
- **Go：** MVP 以 Developer ID 站外分发、Hardened Runtime 和公证为默认验证路线；Electron Renderer 使用 Chromium Process Sandbox，安全 Sidecar 再使用独立 macOS App Sandbox/XPC 权限。
- **No-Go：** 一个覆盖 Client、Runtime、Provider、Memory 和全部 MCP 的共享 Keychain Group。Group 成员拥有同组项的读取能力，授权面会随进程数量扩大。
- **No-Go：** ad-hoc 签名、路径级 Trusted Application ACL、共享明文配置、环境变量、命令行参数或用户全局 Keychain 项作为生产 Secret 方案。
- **No-Go：** `sandbox-exec`、`sandbox_init` 或私有 SBPL 作为产品沙箱。当前系统手册已将它们标记为 Deprecated。
- **No-Go：** 给 Worker `com.apple.security.network.client` 后仅靠代码内 Allowlist 阻止公网。Apple 的 entitlement 只控制能否发起连接，不提供域名、IP 或端口级限制。
- **Deferred Release Gate：** Keychain Access Group、App Sandbox 与升级后无弹窗必须在 Apple Development + Provisioning Profile 和 Developer ID + 目标 Profile 的真实 App/XPC 包上复验。本轮没有使用现有登录 Keychain 私钥，也没有执行公证；按用户确认的本地运行边界，不阻塞 Phase 1–8，但阻塞 Phase 9 发布候选完成。

Phase 0 因此得到可实施的本地安全边界。稳定本地签名足以进入客户端与 Runtime 的本地实现，但不能据此声称目标发布包、升级包、Access Group 或公证已通过。

## 2. 第一性原理拆解

目标不是“把 API Key 放进 Keychain”或“给进程加 Sandbox 标签”，而是同时满足：

1. 未获授权的进程拿不到长期 Secret。
2. 获授权进程升级后仍被系统识别为同一可信产品主体，日常访问不重复弹窗。
3. Worker 即使被 Prompt Injection 或依赖漏洞控制，也不能绕过 Runtime 直接访问公网或 Keychain。
4. Provider/Runner 只能访问自身业务需要的外部目标，不能把一个通用网络进程变成数据出口。
5. 打包、签名、安装、升级、崩溃和撤销不能退回文件、环境变量或手工授权补丁。

这五个目标分别依赖代码签名身份、Keychain entitlement、OS 进程沙箱、产品内目标校验和发布生命周期，任何单层都不能替代其他层。

## 3. 官方平台约束

### 3.1 Keychain Access Group

Apple 的 Keychain Sharing 模型以受代码签名保护的 Access Group 作为多目标共享边界。同一开发团队的多个目标可以通过 entitlement 加入同一组；Keychain Item 只属于一个组。macOS 上应显式使用 Data Protection Keychain 路径并带 `kSecAttrAccessGroup`，不能把旧文件 Keychain ACL 与 Access Group 混为一谈。

这意味着：

- “同一 App 包内”不等于自动共享 Secret。
- “同一 Team”也不等于自动共享，目标仍需具有正确 Group entitlement。
- 把所有进程加入同一组会让每个成员都能查询组内项，违反最小授权。
- Group 名、Team ID、Bundle ID、Provisioning Profile 和最终签名 entitlements 必须在包产物上读回核验，不能只检查源码 Plist。

官方依据：

- [Sharing access to keychain items among a collection of apps](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
- [Configuring keychain sharing](https://developer.apple.com/documentation/xcode/configuring-keychain-sharing)
- [Using the keychain to manage user secrets](https://developer.apple.com/documentation/security/using-the-keychain-to-manage-user-secrets)

### 3.2 代码身份与升级

Apple 将 Designated Requirement 定义为判断当前签名代码是否与此前代码属于同一主体的条件。ad-hoc 签名通常退化为与代码 Hash 绑定的身份，二进制一变就不再是同一可信主体；稳定证书链、Bundle ID 和 Team 保护的 entitlement 才能跨正常升级保持身份连续。

官方依据：[Applying Code Requirements](https://developer.apple.com/documentation/security/applying-code-requirements)。

### 3.3 Hardened Runtime、公证与嵌套代码

Developer ID 站外分发必须覆盖所有可执行代码，启用 Hardened Runtime、时间戳并完成公证。正式包不能保留 `com.apple.security.get-task-allow=true`，也不能为便利关闭 Library Validation 或开放 DYLD 环境注入。每个 Electron Helper、Runtime、Provider、Memory、Runner、Framework 和原生模块都要在最终包中验证签名与 entitlement。

官方依据：

- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)

### 3.4 App Sandbox 与网络

Apple App Sandbox 通过 entitlement 限制文件、网络和其他系统资源。`com.apple.security.network.client` 是布尔能力：有则可以发起连接，无则不能；它不是目的地 Allowlist。普通继承子进程只能继承父进程静态权限，Apple 明确推荐 XPC 做权限分离，每个 XPC Service 可以拥有独立沙箱。

官方依据：

- [App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)
- [`com.apple.security.network.client`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client)
- [Enabling App Sandbox inheritance](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
- [Creating XPC Services](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingXPCServices.html)

### 3.5 Electron 的两层沙箱不能混称

Electron Renderer 的 Process Sandbox 来自 Chromium，解决 Renderer 对系统资源的直接访问；macOS App Sandbox 是 Apple 的进程权限系统。两者必须分别验证。

Electron 官方要求保持 Renderer Sandbox、`contextIsolation`、禁用 Node Integration、限制导航和窗口创建、验证 IPC Sender。标准 Darwin Electron Build 不能直接作为 Mac App Store App Sandbox 包运行；MAS Build 还有 `autoUpdater` 等限制。因此本 MVP 先验证 Developer ID 站外分发，不把 Mac App Store 路线和普通构建混在同一验收矩阵。

官方依据：

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox/)
- [Electron Mac App Store Submission Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide/)

如果后续决定进入 Mac App Store，必须建立独立 MAS Build、签名、Sandbox、Updater 和 Sidecar 兼容性路线，不能把本结论直接复用为已通过。

## 4. 进程与权限矩阵

| 主体 | 代码身份 | 长期 Keychain Secret | 网络 | 本地 IPC | 强制约束 |
|---|---|---|---|---|---|
| Electron Renderer | Electron Helper Renderer 签名目标 + Chromium Sandbox | 无 | 默认无业务外连；只加载本地应用内容 | 仅窄 `contextBridge` | `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、CSP、禁止任意导航 |
| Electron Main/Preload | 主 App 与对应 Helper 签名目标 | 无业务 Secret | 标准站外 Build 不把它视为 OS 网络沙箱；不承载模型、Tool 或通用网络代理 | 连接 Runtime | 不暴露通用 IPC、Shell、文件或 Keychain API；业务网络下沉到 Sidecar |
| Local Control Runtime | 独立 Bundle ID 的签名 Helper/XPC Host | 无 Provider/MCP 长期 Secret | 默认无公网 | 接收 Client 命令；通过私有 IPC 编排 Worker/Provider/Runner | 唯一控制面、Peer Identity、Schema、RunGrant、预算 |
| Deep Agents Worker | 冻结为独立可执行目标，不运行任意用户 Python | 无 Access Group | 无 `network.client` | 只与 Runtime 交换版本化消息 | 只生成 Proposal；无 Shell、文件、真实 Tool、Credential |
| Provider Service | 独立签名 XPC/Helper | 仅 Provider Secret Group | 有 `network.client` | 只接受 Runtime 的版本化请求 | 固定 Provider Origin、模型、预算、重放和敏感信息检查 |
| Memory Service | 独立签名 XPC/Helper | 仅 Memory Master Key Group | 默认无公网 | 只接受 Runtime 的 Scope 化请求 | 本地存储；云提取另走 Provider |
| Credentialed MCP Service | 每个高风险 MCP 独立签名目标 | 仅本 MCP Group，或由专用 Broker 单次注入 | 仅按 MCP 需要开启 | 只接受 Runtime ToolAction | 不与其他 MCP 共组；禁止全局 CLI/Cookie 继承 |
| Network Research Runner | 每个来源族独立签名目标 | GitHub Token 等仅对应 Group；RSS 无 Secret | 有 `network.client` | 只接受固定 Source Contract | entitlement 之外叠加 Origin、DNS、重定向和响应上限 |
| Local/File Runner | 独立签名目标 | 无 | 无 `network.client` | 只接受 Runtime ToolAction | 只获得 RunGrant 目录；不能借 Provider 出网 |

Python 源文件、Shell Script 或用户全局 CLI 不能成为生产 Secret 主体。需要 Python 的 Sidecar 必须冻结到受管 Runtime，打包为独立可签名产物，并验证其加载路径不能被用户文件、`PYTHONPATH`、DYLD 或工作目录替换。

## 5. Keychain 设计

### 5.1 按 Secret 类别拆组

建议逻辑命名如下，实际值由 Team ID 前缀和 Provisioning Profile 决定：

| Group | 成员 | 内容 |
|---|---|---|
| `TEAMID.com.kakarrot.ai-employee-os.provider-secrets` | Provider Service | Poe、DeepSeek API Key |
| `TEAMID.com.kakarrot.ai-employee-os.memory-key` | Memory Service | 本地记忆主密钥及轮换元数据 |
| `TEAMID.com.kakarrot.ai-employee-os.mcp.<id>` | 对应 MCP Service | 该 MCP 的 OAuth Refresh Token/API Key |
| `TEAMID.com.kakarrot.ai-employee-os.research.github` | GitHub Research Runner | 可选 GitHub Token |

Client、Renderer、Preload、Runtime 和 Worker 不加入这些组。用户在设置页录入 Credential 时，Renderer 只持有表单瞬时值，通过窄 IPC 送到对应 Service 完成校验和 `SecItemAdd`/`SecItemUpdate`；保存后立即清空表单状态。Runtime 只得到 `credential_ref + state`，不能读取 Secret 正文。

### 5.2 Item 约束

- 使用 Data Protection Keychain 路径与明确 `kSecAttrAccessGroup`。
- 默认选择仅当前设备可用的可访问级别；是否允许锁屏后台任务访问由产品后台语义单独决定，不能为避免报错使用 Always。
- Account/Service 只放稳定、非敏感索引；Secret、Refresh Token 和主密钥在 Value Data。
- 更新使用 `SecItemUpdate`，断开连接使用 `SecItemDelete`；不存在时与权限失败使用不同错误码。
- 日志只记录 Credential Ref、Provider/MCP ID、操作结果和稳定错误类别，不记录 Item Value、查询字典或系统弹窗文本中的敏感字段。
- 不读取、不迁移用户已有 CLI、Shell、浏览器或旧 App Keychain 项；用户必须在本产品内单独授权。

### 5.3 为什么不使用路径 ACL

旧式 `SecAccess`/`SecTrustedApplication` 能表达“哪些应用读取时不提示”，但它依赖历史文件 Keychain 模型和代码身份匹配，升级、路径、重签和多目标维护成本高。它适合本轮复现根因，不适合作为新产品跨多个 Sidecar 的长期授权模型。

## 6. 本地 IPC 修订

此前 Provider Spike 使用“Worker 持短期 Grant 连接随机回环端口”。该路径虽然能隐藏 API Key，却要求 Worker 拥有建立 TCP 连接的能力；macOS App Sandbox 的 `network.client` 一旦授予，就不只允许该回环端口。

目标链路修订为：

```text
Deep Agents Worker
  │ versioned framed pipe / private Unix Domain Socket
  ▼
Local Control Runtime
  │ private embedded XPC or signed-helper IPC
  ▼
Provider Service
  │ HTTPS to one fixed Provider Origin
  ▼
Poe / DeepSeek
```

短期 Grant 仍绑定 Run、Provider、Model、Budget、Audience、Nonce 和 Expiry，但由 Runtime 随版本化请求转交 Provider，不再作为开放 TCP Endpoint 的唯一防线。Provider 必须拒绝来自非预期 Runtime 身份的连接；使用原生 XPC 时优先利用嵌入式私有服务和 Audit Token/Code Requirement 校验，不自造“只看 PID”的身份协议。

Unix Domain Socket 只作为无法直接接入 XPC 的语言边界；Socket 必须位于应用控制目录，创建前防符号链接/抢占，权限最小化，连接后核验 Peer Credential，并由 Runtime 管理生命周期。随机回环 TCP 不再是目标默认方案。

## 7. 可执行 Spike 结果

### 7.1 临时 Keychain ACL

脚本创建隔离临时 Keychain，编译三个不同 ad-hoc 签名 Reader，关闭 Keychain 交互后验证：

| 断言 | 结果 |
|---|---|
| ACL 明确信任的 Reader 静默读取测试 Secret | 通过 |
| 不同签名 Reader 静默读取 | 拒绝 |
| 同一路径替换为不同签名 Reader 后静默读取 | 拒绝 |
| 输出测试 Secret 正文 | 未输出 |
| 读取或修改用户登录 Keychain | 未发生 |

该结果证明“签名身份变化会改变 Secret 授权”，不证明 ad-hoc 或旧 ACL 可以进入生产。

### 7.2 网络失败模型

本机 `sandbox-exec` 使用 `deny network*` 后，测试 Client 无法连接临时回环 Server；未沙箱 Control 可以连接。系统 `man sandbox-exec` 和 `man sandbox_init` 均明确标记 Deprecated，因此该结果只用于确认失败模型，不用于选型。

对带 App Sandbox entitlement 的 ad-hoc 签名裸 CLI 的尝试中，`no-network` 和 `network-client` 两个变体都在连接前被系统终止。缺少 Provisioning Profile 与真实签名身份时，结果不能区分 entitlement 行为。本轮保留两份语法有效的 entitlement 模板，但把运行时验证明确列入真实签名包门禁。

### 7.3 稳定本地签名升级

`run_stable_signing_upgrade_spike.sh` 使用项目专用 `AI Employee OS Local Development` 身份签署两个内容不同但 Bundle Identifier 相同的 Reader，并在隔离临时 Keychain 上验证：

| 断言 | 结果 |
|---|---|
| 初始稳定签名 Reader 无交互读取测试 Secret | 通过 |
| 同一身份、同一标识、变更后二进制无交互读取 | 通过 |
| 同一路径改为 ad-hoc 签名链后读取 | 拒绝 |
| 输出或写入登录 Keychain 业务 Secret | 未发生 |

该结果补充证明稳定 Designated Requirement 可以跨二进制变化保持旧式 ACL 身份连续性。它使用本地自签身份，不含 Apple Team、Access Group、Provisioning Profile、App Sandbox 或公证，因此不能替代真实开发/发布包门禁。

## 8. 本地开发、发布与升级验收矩阵

当前执行顺序是：Phase 1–8 使用项目稳定本地签名身份完成本地闭环；Phase 9 再引入 Apple Development、Developer ID、Provisioning Profile 与公证材料。延期只改变执行顺序，不降低发布验收标准。

### 8.1 本地开发签名

- Phase 1–8 使用项目稳定本地签名身份，保持 Bundle Identifier 和签名链稳定；不使用 ad-hoc 作为正常开发身份。
- 本地 Credential 只用于明确授权的开发探测；不得把登录 Keychain 旧项、环境变量或文件迁移为产品 Credential 方案。
- 本地自签稳定证书可以复现 Designated Requirement 连续性，但不能替代 Apple entitlement/Profile 验证；涉及 Access Group 或正式 App Sandbox 的断言保持未验证。

### 8.2 Phase 9 发布签名

- 使用 Developer ID Application 身份，所有嵌套可执行目标从内到外签名。
- 所有目标启用 Hardened Runtime 与安全时间戳。
- 分发包不含 `get-task-allow`，不开放未证明必要的 JIT、Unsigned Executable Memory、Disable Library Validation 或 DYLD entitlement。
- 枚举每个嵌套目标执行 `codesign --verify --strict`，读回 Team ID、Designated Requirement 和 entitlements；再执行整包验证、Gatekeeper 评估、公证日志检查与 Staple 验证。

Electron/Chromium 如确实需要 JIT entitlement，只能授予 Electron 官方要求的精确 Helper，不得复制到 Runtime、Provider、Worker 或 Runner。

### 8.3 升级测试

必须在干净测试账户和保留旧数据的升级账户各执行：

1. 版本 N 保存测试 Credential，重启 N，确认无额外授权弹窗。
2. 升级到 N+1，Team、Bundle ID、Group 不变，确认 Provider 可读且 Client/Runtime/Worker 不可读。
3. 用移除 Group entitlement 的 Provider 负例包，确认 `errSecMissingEntitlement` 或稳定权限失败。
4. 用不同 Bundle ID、不同 Team 或不同签名链负例包，确认不能静默读取。
5. Provider 崩溃和重启后，Secret 不进入参数、环境、Crash Report、日志或 Core Dump 可读路径。
6. 撤销 Credential 后，旧 Run 和重启后的 Service 都不能继续访问；恢复必须重新授权。
7. 回滚到 N 时执行 Schema/Group 兼容检查，不因找不到新项而退回文件或环境变量。

UI 自动化只能判断产品没有主动展示重复弹窗；系统授权对话框仍需在真实签名包上做人工观察并记录视频/截图、版本、Team、Profile 和包 Hash。

## 9. Phase 1/3 实现门禁

### Phase 1 Electron 壳

- `app.enableSandbox()` 在 `ready` 前调用；所有 Renderer 保持 `sandbox=true`。
- `nodeIntegration=false`、`contextIsolation=true`、禁止 `webviewTag`，Preload 只暴露版本化命令。
- 只加载打包本地内容；CSP、导航、新窗口、Permission Request、IPC Sender 全部默认拒绝。
- 主 App 与所有 Electron Helper 完整签名，entitlement 不从 Main 无差别复制到所有 Helper。

### Phase 2 Runtime/Sidecar

- 先做签名目标与 IPC Skeleton，再接业务功能。
- Worker 使用 Pipe/UDS，不获得 Keychain Group 或 Network Client。
- Provider/Memory/Runner 各有 Bundle ID、entitlement 文件、允许的父调用者和崩溃清理测试。

### Phase 3 Credential/Provider

- 先在 Fake Credential 上通过 Access Group 正负例与升级矩阵，再输入真实用户 Credential。
- Provider 读取真实 Key 前，必须通过签名、Peer Identity、固定 Origin、日志脱敏和内存生命周期检查。
- 至少一个真实 Provider 的 Streaming、结构化输出、Tool Proposal、Usage、取消和错误探测仍需用户明确配置 Credential。

## 10. 延期到 Phase 9 的发布风险

- 当前没有 Apple Development/Developer ID 目标 Profile，未验证最终 Access Group entitlement 是否被系统接受。
- 当前没有 Electron App、XPC Bundle 或冻结 Python Worker，未验证真实打包结构、嵌套签名和语言间 IPC。
- 当前没有执行 Developer ID 公证、Staple、Gatekeeper、升级或回滚。
- 当前没有验证 macOS App Sandbox 下 Unix Domain Socket、XPC Streaming、取消和高吞吐行为。
- Electron 标准 Build 与 MAS Build 是不同路线；若产品改选 Mac App Store，需要单独重开审计。
- App Sandbox 不能提供目标域 Allowlist；Provider/Runner 的 DNS Rebinding、代理、重定向和敏感数据出口仍需应用层和网络测试。
- Secret 在授权进程内的最短生命周期、内存清理、Crash Dump 和诊断上传仍待正式实现验证。

**最终判定：多进程安全边界已经从“所有签名进程共享 Keychain + Worker 回环 TCP”修订为“最小 Access Group + Worker 无网络 + Runtime 私有 IPC + 独立 Provider/Runner 权限”。本地稳定签名和真实 DeepSeek 已满足本地 Phase 0 门禁；Apple 签名/Profile、无弹窗升级与公证矩阵延期到 Phase 9，未通过前不得形成发布候选。**
