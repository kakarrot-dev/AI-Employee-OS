import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), 'utf8') }

describe('Feishu IPC security boundary', () => {
  it('keeps secrets behind the narrow preload bridge', () => {
    const main = source('src/main/index.ts')
    const preload = source('src/preload/index.ts')
    const rendererTypes = source('src/renderer/src/env.d.ts')
    for (const operation of ['getFeishuStatus', 'openFeishuDeveloperConsole', 'connectFeishu', 'cancelFeishuAuthorization', 'disconnectFeishu']) {
      expect(main).toContain(`CONNECTION_IPC.${operation}`)
      expect(preload).toContain(`CONNECTION_IPC.${operation}`)
    }
    expect(rendererTypes).toContain('connection: ConnectionBridge')
    expect(preload).not.toContain('accessToken')
    expect(preload).not.toContain('refreshToken')
  })

  it('stores and removes Feishu credentials only through the native Keychain helper', () => {
    const helper = source('spikes/macos-process-security/provider_keychain_helper.c')
    expect(helper).toContain('com.kakarrot.ai-employee-os.feishu.credentials.v1')
    expect(helper).toContain('feishu-oauth-credential')
    expect(helper).toContain('strcmp(provider, "feishu")')
  })

  it('keeps ws optional native accelerators out of the bundled main process', () => {
    const config = source('electron.vite.config.ts')
    expect(config).toContain("'process.env.WS_NO_BUFFER_UTIL': '\"1\"'")
    expect(config).toContain("'process.env.WS_NO_UTF_8_VALIDATE': '\"1\"'")
  })
})
