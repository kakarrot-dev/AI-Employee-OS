import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProviderId } from './models'

const execFileAsync = promisify(execFile)

export const LOCAL_KEYCHAIN_SERVICES: Record<ProviderId, string> = {
  deepseek: 'com.kakarrot.ai-employee-os.credentials.v2',
  poe: 'com.kakarrot.ai-employee-os.poe.credentials.v1'
}

export interface CredentialReader {
  read(provider: ProviderId): Promise<string>
  exists(provider: ProviderId): Promise<boolean>
}

export interface CredentialStore extends CredentialReader {
  write(provider: ProviderId, credential: string): Promise<void>
}

export function normalizeCredential(value: string): string {
  const credential = value.trim()
  if (credential.length < 8 || credential.length > 8192 || /[\r\n]/.test(credential)) throw new Error('credential_invalid')
  return credential
}

export class MacOSKeychainCredentialReader implements CredentialStore {
  constructor(private readonly helperPath: string) {}

  async read(provider: ProviderId): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.helperPath, ['read', provider], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024,
        timeout: 3000,
        windowsHide: true
      })
      const credential = stdout.trim()
      if (!credential || credential.length > 8192) throw new Error('credential_invalid')
      return credential
    } catch (error) {
      if (error instanceof Error && error.message === 'credential_invalid') throw error
      throw new Error('credential_unavailable')
    }
  }

  async exists(provider: ProviderId): Promise<boolean> {
    try {
      await this.read(provider)
      return true
    } catch {
      return false
    }
  }

  async write(provider: ProviderId, value: string): Promise<void> {
    const credential = normalizeCredential(value)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.helperPath, ['write', provider], {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true
      })
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('credential_store_timeout'))
      }, 5000)
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString('utf8')
      })
      child.once('error', () => {
        clearTimeout(timer)
        reject(new Error('credential_store_failed'))
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(stderr.includes('User interaction is not allowed') ? 'credential_store_denied' : 'credential_store_failed'))
      })
      child.stdin.end(credential)
    })
  }
}
