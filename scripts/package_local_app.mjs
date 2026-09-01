import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { packager } from '@electron/packager'

const repository = resolve(import.meta.dirname, '..')
const releaseRoot = join(repository, 'build/local-release')
const stageRoot = join(releaseRoot, 'app-stage')
mkdirSync(stageRoot, { recursive: true, mode: 0o700 })
cpSync(join(repository, 'out'), join(stageRoot, 'out'), { recursive: true })
const sourcePackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'))
writeFileSync(join(stageRoot, 'package.json'), JSON.stringify({ name: sourcePackage.name, version: sourcePackage.version, description: sourcePackage.description, type: 'module', main: './out/main/index.js', private: true }, null, 2) + '\n')

const paths = await packager({
  dir: stageRoot,
  out: join(releaseRoot, 'dist'),
  overwrite: true,
  name: 'AI Employee OS',
  appBundleId: 'com.kakarrot.ai-employee-os',
  appVersion: sourcePackage.version,
  buildVersion: sourcePackage.version,
  platform: 'darwin',
  arch: 'arm64',
  electronVersion: '44.0.0',
  asar: true,
  osxSign: false,
  prune: false,
  extraResource: [join(releaseRoot, 'runtime'), join(releaseRoot, 'legal')]
})
console.log(JSON.stringify({ paths }, null, 2))
