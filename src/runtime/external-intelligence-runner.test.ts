import { describe, expect, it } from 'vitest'
import { runCommand } from './external-intelligence-runner'

describe('external intelligence command lifecycle', () => {
  it.skipIf(process.platform === 'win32')('kills the whole process group when a command ignores the timeout', async () => {
    const child = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
    const parent = `const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: ['ignore', process.stdout, process.stderr] }); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`
    const startedAt = Date.now()

    const result = await runCommand(process.execPath, ['-e', parent], new AbortController().signal, 50)

    expect(result.status).not.toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
