import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const helper = resolve('build/native/provider-keychain-helper')

function invoke(operation: 'read' | 'write' | 'delete', input?: string): ReturnType<typeof spawnSync> {
  return spawnSync(helper, [operation, 'test'], { input, encoding: 'utf8', timeout: 5000, windowsHide: true })
}

afterEach(() => { invoke('delete') })

describe('provider Keychain helper', () => {
  it('writes, reads and replaces a credential without an interactive prompt', () => {
    expect(invoke('write', 'poe-test-key-first').status).toBe(0)
    expect(invoke('read').stdout).toBe('poe-test-key-first')
    expect(invoke('write', 'poe-test-key-second').status).toBe(0)
    expect(invoke('read').stdout).toBe('poe-test-key-second')
  })

  it('rejects an undersized credential', () => {
    expect(invoke('write', 'short').status).toBe(3)
  })
})
