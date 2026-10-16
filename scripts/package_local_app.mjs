import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { packager } from '@electron/packager'
import { externalPackageReferences } from './package_dependencies.mjs'

import { releaseRoot as resolveReleaseRoot } from './release_paths.mjs'

const repository = resolve(import.meta.dirname, '..')
const releaseRoot = resolveReleaseRoot(repository)
const stageRoot = join(releaseRoot, 'app-stage')
if (existsSync(stageRoot)) rmSync(stageRoot, { recursive: true })
mkdirSync(stageRoot, { recursive: true, mode: 0o700 })
cpSync(join(repository, 'out'), join(stageRoot, 'out'), { recursive: true })
const sourcePackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'))
// The emitted code is authoritative: vendor createRequire calls can survive bundling too.
const references = []
function inspectEmitted(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) inspectEmitted(path)
    else if (/\.(?:cjs|mjs|js)$/.test(entry.name)) for (const reference of externalPackageReferences(readFileSync(path, 'utf8'))) references.push({ ...reference, file: path })
  }
}
inspectEmitted(join(repository, 'out/main'))
inspectEmitted(join(repository, 'out/preload'))
const optionalUnavailable = [], resolvedReferences = []
for (const reference of references) {
  try {
    const resolved = createRequire(reference.file).resolve(reference.specifier)
    resolvedReferences.push({ ...reference, resolved })
  } catch (error) {
    if (reference.required) throw new Error(`packaged_dependency_unresolved:${reference.specifier}`, { cause: error })
    optionalUnavailable.push(reference)
  }
}
const externalPackages = [...new Set(resolvedReferences.map(reference => reference.packageName))].sort()
const copied = new Set()
function copyPackage(name, from, optional = false) {
  const lookup = createRequire(from).resolve.paths(`${name}/package.json`) ?? []
  const source = lookup.map(root => join(root, name)).find(root => existsSync(join(root, 'package.json')))
  if (!source) {
    if (optional) return
    throw new Error(`packaged_dependency_missing:${name}`)
  }
  const installed = realpathSync(source), installedRoot = join(repository, 'node_modules')
  if (!installed.startsWith(installedRoot + '/')) throw new Error(`packaged_dependency_outside_repository:${name}`)
  const manifest = join(installed, 'package.json'), pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  if (copied.has(installed)) return pkg.version
  copied.add(installed)
  cpSync(installed, join(stageRoot, 'node_modules', relative(installedRoot, installed)), { recursive: true, dereference: true })
  for (const dependency of Object.keys(pkg.dependencies ?? {})) copyPackage(dependency, manifest)
  for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) copyPackage(dependency, manifest, true)
  return pkg.version
}
const dependencies = Object.fromEntries(externalPackages.map(name => [name, copyPackage(name, join(repository, 'package.json'))]))
writeFileSync(join(stageRoot, 'package.json'), JSON.stringify({ name: sourcePackage.name, version: sourcePackage.version, description: sourcePackage.description, type: 'module', dependencies, main: './out/main/index.js', private: true }, null, 2) + '\n')

const electronZipDir = process.argv.find(value => value.startsWith('--electron-zip-dir='))?.slice('--electron-zip-dir='.length)
const paths = await packager({
  ...(electronZipDir ? { electronZipDir: resolve(electronZipDir) } : {}),
  dir: stageRoot,
  out: join(releaseRoot, 'dist'),
  overwrite: true,
  name: 'AI Employee OS',
  appBundleId: 'com.kakarrot.ai-employee-os',
  appVersion: sourcePackage.version,
  buildVersion: sourcePackage.version,
  platform: 'darwin',
  arch: 'arm64',
  electronVersion: sourcePackage.devDependencies.electron,
  asar: { unpack: '**/*.{node,dylib}' },
  osxSign: false,
  prune: false,
  extraResource: [join(releaseRoot, 'runtime'), join(releaseRoot, 'legal')]
})
console.log(JSON.stringify({ paths, externalPackages, installedPackagesCopied: copied.size, resolvedReferences, optionalUnavailable }, null, 2))
