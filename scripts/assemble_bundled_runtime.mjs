import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const buildRoot = join(repository, 'build', 'local-release')
const runtimeRoot = join(buildRoot, 'runtime')

function resetBuildDirectory(path) {
  if (!path.startsWith(join(repository, 'build') + '/') || basename(path) !== 'local-release') throw new Error('unsafe_build_directory')
  if (existsSync(path)) rmSync(path, { recursive: true })
  mkdirSync(path, { recursive: true, mode: 0o700 })
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: repository, stdio: 'inherit', env: process.env, ...options })
}

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }

function materializeSymlinks(root) {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (lstatSync(path).isSymbolicLink()) {
        const target = realpathSync(path)
        const targetStats = statSync(target)
        rmSync(path)
        cpSync(target, path, { recursive: targetStats.isDirectory(), dereference: true, preserveTimestamps: true })
      } else if (entry.isDirectory()) visit(path)
    }
  }
  visit(root)
}

function installPython(version, destination, sourceSitePackages, pythonMinor) {
  const installRoot = join(buildRoot, `.python-${version}`)
  run('uv', ['python', 'install', '--install-dir', installRoot, version])
  const versionDirectory = readdirSync(installRoot).find((name) => name.startsWith(`cpython-${version}-`))
  if (!versionDirectory) throw new Error(`python_install_missing:${version}`)
  cpSync(join(installRoot, versionDirectory), destination, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true })
  const versionedExecutable = join(destination, 'bin', `python${pythonMinor}`)
  const portableExecutable = join(destination, 'bin', 'python3')
  if (existsSync(portableExecutable)) rmSync(portableExecutable)
  cpSync(versionedExecutable, portableExecutable)
  chmodSync(portableExecutable, 0o755)
  const targetSitePackages = join(destination, 'lib', `python${pythonMinor}`, 'site-packages')
  mkdirSync(targetSitePackages, { recursive: true })
  cpSync(sourceSitePackages, targetSitePackages, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true })
}

resetBuildDirectory(buildRoot)
mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 })

const deepRoot = join(runtimeRoot, 'deep-agents')
const memoryRoot = join(runtimeRoot, 'local-memory')
installPython('3.14.7', join(deepRoot, 'python'), join(repository, 'spikes/deep-agents/.venv/lib/python3.14/site-packages'), '3.14')
installPython('3.12.14', join(memoryRoot, 'python'), join(repository, 'spikes/local-memory/.venv/lib/python3.12/site-packages'), '3.12')

cpSync(join(repository, 'spikes/deep-agents/formal_worker.py'), join(deepRoot, 'formal_worker.py'))
cpSync(join(repository, 'spikes/local-memory/memory_worker.py'), join(memoryRoot, 'memory_worker.py'))
mkdirSync(join(memoryRoot, 'bin'), { recursive: true })
cpSync(join(repository, 'build/native/memory-keychain-helper'), join(memoryRoot, 'bin/memory-keychain-helper'))
cpSync(join(repository, 'build/native/provider-keychain-helper'), join(memoryRoot, 'bin/provider-keychain-helper'))
cpSync(join(repository, 'build/native/image-text-extractor'), join(memoryRoot, 'bin/image-text-extractor'))
cpSync(join(repository, 'spikes/local-memory/.model-cache'), join(memoryRoot, 'model-cache'), { recursive: true, filter: (source) => !source.includes('/.locks') })
materializeSymlinks(runtimeRoot)

const deepPython = join(deepRoot, 'python/bin/python3')
const memoryPython = join(memoryRoot, 'python/bin/python3')
run(deepPython, ['-I', '-c', 'import deepagents, langchain, langgraph, sqlite3; print("deep-runtime-ok")'], { env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' } })
run(memoryPython, ['-I', '-c', 'import cryptography, fastembed, numpy, sqlite3; print("memory-runtime-ok")'], { env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' } })
run(deepPython, ['-m', 'pip', 'check'], { env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' } })
run(memoryPython, ['-m', 'pip', 'check'], { env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' } })

const manifest = {
  schemaVersion: 1,
  architecture: process.arch,
  platform: process.platform,
  deepAgentPython: '3.14.7',
  memoryPython: '3.12.14',
  deepAgentsLockSha256: sha256(join(repository, 'spikes/deep-agents/uv.lock')),
  localMemoryLockSha256: sha256(join(repository, 'spikes/local-memory/uv.lock')),
  workerSha256: {
    deepAgents: sha256(join(deepRoot, 'formal_worker.py')),
    localMemory: sha256(join(memoryRoot, 'memory_worker.py')),
    keychainHelper: sha256(join(memoryRoot, 'bin/memory-keychain-helper')),
    providerKeychainHelper: sha256(join(memoryRoot, 'bin/provider-keychain-helper')),
    imageTextExtractor: sha256(join(memoryRoot, 'bin/image-text-extractor'))
  },
  embedding: {
    model: 'BAAI/bge-small-zh-v1.5',
    dimensions: 512,
    onnxSha256: '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38'
  }
}
writeFileSync(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify({ runtimeRoot, bytes: statSync(runtimeRoot).size, manifest }, null, 2))
