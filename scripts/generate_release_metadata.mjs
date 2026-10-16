import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { releaseRoot as resolveReleaseRoot } from './release_paths.mjs'

const repository = resolve(import.meta.dirname, '..')
const releaseRoot = resolveReleaseRoot(repository)
const legalRoot = join(releaseRoot, 'legal')
mkdirSync(legalRoot, { recursive: true, mode: 0o700 })

const lock = JSON.parse(readFileSync(join(repository, 'package-lock.json'), 'utf8'))
const openClaudeRoot = join(repository, 'third_party/open-claude-ui')
const openClaude = JSON.parse(readFileSync(join(openClaudeRoot, 'provenance.json'), 'utf8'))
const sourceComponents = [{ ecosystem: 'source', name: openClaude.name, version: openClaude.commit, license: openClaude.license }]
writeFileSync(join(legalRoot, 'open-claude-ui-LICENSE.txt'), readFileSync(join(openClaudeRoot, 'LICENSE')))
writeFileSync(join(legalRoot, 'open-claude-ui-provenance.json'), JSON.stringify(openClaude, null, 2) + '\n')
const nodeComponents = Object.entries(lock.packages ?? {}).filter(([path, value]) => path.startsWith('node_modules/') && value.dev !== true).map(([path, value]) => ({ ecosystem: 'npm', name: value.name ?? path.replace(/^node_modules\//, ''), version: value.version ?? 'unknown', license: value.license ?? 'UNKNOWN' })).sort((left, right) => left.name.localeCompare(right.name))

function pythonComponents(pythonPath) {
  const script = `import importlib.metadata,json\ndef license_of(d):\n v=d.metadata.get("License-Expression") or d.metadata.get("License")\n if v and v.strip() and v.strip().upper()!="UNKNOWN": return v.strip()\n classifiers=d.metadata.get_all("Classifier") or []\n if any("MIT License" in x for x in classifiers): return "MIT"\n if any("Apache Software License" in x for x in classifiers): return "Apache-2.0"\n for f in d.files or []:\n  if "license" in str(f).lower():\n   try:\n    first=d.locate_file(f).read_text(errors="ignore").splitlines()[0].strip()\n    if first: return "MIT" if first=="MIT License" else first\n   except Exception: pass\n return "UNKNOWN"\nprint(json.dumps(sorted([{"ecosystem":"python","name":d.metadata.get("Name",d.name),"version":d.version,"license":license_of(d)} for d in importlib.metadata.distributions()],key=lambda x:x["name"].lower())))`
  return JSON.parse(execFileSync(pythonPath, ['-I', '-c', script], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' } }))
}

const memory = pythonComponents(join(releaseRoot, 'runtime/local-memory/python/bin/python3'))
const byKey = new Map()
for (const component of [...nodeComponents, ...memory, ...sourceComponents]) byKey.set(`${component.ecosystem}:${component.name}:${component.version}`, component)
const components = [...byKey.values()].sort((left, right) => `${left.ecosystem}:${left.name}`.localeCompare(`${right.ecosystem}:${right.name}`))
writeFileSync(join(legalRoot, 'third-party-components.json'), JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), components }, null, 2) + '\n')
writeFileSync(join(legalRoot, 'THIRD_PARTY_NOTICES.md'), `# Third-party components\n\nGenerated from package-lock.json, vendored source provenance and the bundled local-memory Python runtime. Open Claude UI copyright and the complete MIT license are included in open-claude-ui-LICENSE.txt. License expressions marked UNKNOWN require review before public distribution.\n\n| Ecosystem | Component | Version | Declared license |\n| --- | --- | --- | --- |\n${components.map((value) => `| ${value.ecosystem} | ${value.name.replaceAll('|', '\\|')} | ${value.version} | ${String(value.license).replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n')}\n`)
writeFileSync(join(legalRoot, 'PRIVACY.md'), readFileSync(join(repository, 'docs/privacy.md')))
writeFileSync(join(legalRoot, 'STORAGE_AND_RECOVERY.md'), readFileSync(join(repository, 'docs/storage-and-recovery.md')))
console.log(JSON.stringify({ componentCount: components.length, unknownLicenseCount: components.filter((value) => value.license === 'UNKNOWN').length }))
