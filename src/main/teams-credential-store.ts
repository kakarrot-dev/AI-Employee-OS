import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
const execFileAsync = promisify(execFile)
export interface TeamsCredentialStore { read(): Promise<string | undefined>; write(value: string): Promise<void>; delete(): Promise<void> }
export class MacOSKeychainTeamsCredentialStore implements TeamsCredentialStore {
  constructor(private readonly helperPath: string) {}

  async read(): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(this.helperPath, ['read', 'teams'], { encoding: 'utf8', maxBuffer: 16 * 1024, timeout: 10_000, windowsHide: true })
      return stdout.trim() || undefined
    } catch (error) {
      const detail = error as { code?: unknown; killed?: unknown }
      const exitCode = detail.code
      if (exitCode === 44) return undefined
      if (exitCode === 'ETIMEDOUT' || detail.killed === true) throw new Error('teams_credential_timeout')
      throw new Error('teams_credential_unavailable')
    }
  }

  async write(value: string): Promise<void> {
    if (value.length < 8 || Buffer.byteLength(value, 'utf8') > 8192) throw new Error('teams_credential_invalid')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.helperPath, ['write', 'teams'], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
      let stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('teams_credential_store_timeout')) }, 5000)
      child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString('utf8') })
      child.once('error', () => { clearTimeout(timer); reject(new Error('teams_credential_store_failed')) })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(stderr.includes('User interaction is not allowed') ? 'teams_credential_store_denied' : 'teams_credential_store_failed'))
      })
      child.stdin.end(value)
    })
  }

  async delete(): Promise<void> {
    try {
      await execFileAsync(this.helperPath, ['delete', 'teams'], { encoding: 'utf8', timeout: 3000, windowsHide: true })
    } catch { throw new Error('teams_credential_delete_failed') }
  }
}
