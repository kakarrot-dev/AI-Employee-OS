import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { packager } from '@electron/packager'

const repository = resolve(import.meta.dirname, '..')
const releaseRoot = join(repository, 'build/prototype-release')
const stageRoot = join(releaseRoot, 'app-stage')
rmSync(stageRoot, { recursive: true, force: true })
mkdirSync(stageRoot, { recursive: true })
// Only copy the shell and renderer: stale runtime/preload outputs cannot enter the app.
for (const component of ['main', 'renderer']) {
  cpSync(join(repository, 'out', component), join(stageRoot, 'out', component), { recursive: true })
}
const sourcePackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'))
writeFileSync(join(stageRoot, 'package.json'), JSON.stringify({
  name: sourcePackage.name,
  version: sourcePackage.version,
  description: sourcePackage.description,
  type: 'module',
  main: './out/main/index.js',
  private: true
}, null, 2) + '\n')

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('此安装包需要在 Apple Silicon macOS 上构建。')
}
const electronDist = join(repository, 'node_modules/electron/dist')
const electronVersion = readFileSync(join(electronDist, 'version'), 'utf8').trim()
if (electronVersion !== sourcePackage.devDependencies.electron) {
  throw new Error('本地 Electron 版本不匹配，请先执行 npm ci。')
}
const electronZipDir = join(releaseRoot, 'electron-cache')
mkdirSync(electronZipDir, { recursive: true })
const electronZip = join(electronZipDir, `electron-v${electronVersion}-darwin-arm64.zip`)
// Reuse npm's installed Electron distribution; packaging does not download a second copy.
execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--noextattr', '--noqtn', electronDist, electronZip])

const paths = await packager({
  dir: stageRoot,
  out: join(releaseRoot, 'dist'),
  overwrite: true,
  name: 'AI Employee OS Prototype',
  appBundleId: 'com.kakarrot.ai-employee-os.prototype',
  appVersion: sourcePackage.version,
  buildVersion: sourcePackage.version,
  platform: 'darwin',
  arch: 'arm64',
  electronVersion,
  electronZipDir,
  asar: true,
  osxSign: false,
  prune: false
})
const archive = join(releaseRoot, 'AI-Employee-OS-Prototype-mac-arm64.zip')
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', paths[0], archive])
console.log(JSON.stringify({ paths, archive }, null, 2))
