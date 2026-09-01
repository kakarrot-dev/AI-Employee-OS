import { execFile } from 'node:child_process'
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

export class MacOSKeychainCredentialReader implements CredentialReader {
  async read(provider: ProviderId): Promise<string> {
    const service = LOCAL_KEYCHAIN_SERVICES[provider]
    try {
      const { stdout } = await execFileAsync('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], {
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
}
