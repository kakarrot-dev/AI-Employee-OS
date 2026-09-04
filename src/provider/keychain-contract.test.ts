import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('provider keychain startup contract', () => {
  it('checks credential presence without allowing authentication UI', () => {
    const readerSource = source('src/provider/keychain.ts')
    const helperSource = source('spikes/macos-process-security/provider_keychain_helper.c')

    expect(readerSource).toContain("['exists', provider]")
    expect(helperSource).toContain('strcmp(argv[1], "exists")')
    expect(helperSource).toContain('kSecUseAuthenticationUIFail')
  })

  it('stably signs the credential reader before development and local packaging', () => {
    const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> }
    const signingScript = source('scripts/sign_local_provider_keychain_helper.sh')

    expect(packageJson.scripts.dev).toContain('npm run sign:provider-keychain')
    expect(packageJson.scripts['package:local']).toContain('npm run sign:provider-keychain')
    expect(signingScript).toContain('AI Employee OS Local Development')
    expect(signingScript).toContain('credential_reader_identifier=com.kakarrot.ai-employee-os')
    expect(signingScript).toContain('codesign --verify --strict')
  })
})
