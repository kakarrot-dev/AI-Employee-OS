import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { releaseRoot } from './release_paths.mjs'

const repository = resolve(import.meta.dirname, '..')
const buildRoot = releaseRoot(repository)
const runtimeRoot = join(buildRoot, 'runtime')
const memoryProject = join(repository, 'spikes/local-memory')
const sourcePython = join(memoryProject, '.venv/bin/python')
const modelOption = process.argv.find(value => value.startsWith('--model-cache='))
const modelSource = resolve(modelOption ? modelOption.slice('--model-cache='.length) : join(memoryProject, '.model-cache'))
const modelHash = '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38'
const isolatedEnv = { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' }

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: repository, stdio: 'inherit', env: process.env, ...options })
}
function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function filesBelow(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name)
    return statSync(path).isDirectory() ? filesBelow(path) : [path]
  })
}
function materializeSymlinks(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (lstatSync(path).isSymbolicLink()) {
      const target = realpathSync(path), directory = statSync(target).isDirectory()
      rmSync(path)
      cpSync(target, path, { recursive: directory, dereference: true, preserveTimestamps: true })
    } else if (entry.isDirectory()) materializeSymlinks(path)
  }
}

// Preflight is read-only. A bad ABI, stale environment or missing model must not erase an old build.
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('unsupported_bundled_runtime_platform')
run('uv', ['sync', '--locked', '--check', '--offline', '--no-dev', '--project', memoryProject])
const python = JSON.parse(run(sourcePython, ['-I', '-c', 'import json,platform,sys,sysconfig;print(json.dumps({"version":platform.python_version(),"minor":f"{sys.version_info.major}.{sys.version_info.minor}","basePrefix":sys.base_prefix,"sitePackages":sysconfig.get_path("purelib"),"machine":platform.machine()}))'], { encoding: 'utf8', stdio: 'pipe' }))
if (python.machine !== 'arm64' || !['3.12', '3.13'].includes(python.minor)) throw new Error('memory_python_abi_mismatch')
const sourceModels = filesBelow(modelSource).filter(path => path.endsWith('/model_optimized.onnx'))
if (sourceModels.length !== 1 || sha256(sourceModels[0]) !== modelHash) throw new Error('bundled_embedding_hash_mismatch')
for (const name of ['memory-keychain-helper', 'provider-keychain-helper', 'image-text-extractor']) if (!existsSync(join(repository, 'build/native', name))) throw new Error(`native_helper_missing:${name}`)

if (existsSync(buildRoot)) rmSync(buildRoot, { recursive: true })
const memoryRoot = join(runtimeRoot, 'local-memory'), pythonRoot = join(memoryRoot, 'python')
mkdirSync(memoryRoot, { recursive: true, mode: 0o700 })
cpSync(python.basePrefix, pythonRoot, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true })
const sitePackages = join(pythonRoot, 'lib', `python${python.minor}`, 'site-packages')
rmSync(sitePackages, { recursive: true, force: true })
cpSync(python.sitePackages, sitePackages, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true })
cpSync(join(memoryProject, 'memory_worker.py'), join(memoryRoot, 'memory_worker.py'))
mkdirSync(join(memoryRoot, 'bin'), { recursive: true })
for (const name of ['memory-keychain-helper', 'provider-keychain-helper', 'image-text-extractor']) cpSync(join(repository, 'build/native', name), join(memoryRoot, 'bin', name))
// Snapshot files are materialized; duplicate HF blobs and lock files are not runtime inputs.
cpSync(modelSource, join(memoryRoot, 'model-cache'), { recursive: true, dereference: true, filter: source => !source.split('/').some(part => part === '.locks' || part === 'blobs') })
materializeSymlinks(runtimeRoot)

const memoryPython = join(pythonRoot, 'bin/python3')
run(memoryPython, ['-I', '-c', 'import cryptography,fastembed,numpy,sqlite3;print("memory-runtime-ok")'], { env: isolatedEnv })
run('uv', ['pip', 'check', '--python', memoryPython, '--offline'])
run(memoryPython, ['-I', '-c', 'import importlib.util,socket,sys;spec=importlib.util.spec_from_file_location("bundled_memory",sys.argv[1]);worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker);socket.socket=worker.NetworkDeniedSocket;model=worker.build_model(worker.Path(sys.argv[2]),False);assert model is not None;vector=next(iter(model.query_embed("离线模型校验")));assert len(vector)==worker.MODEL_DIMENSIONS;print("offline-embedding-ok:512")', join(memoryRoot, 'memory_worker.py'), join(memoryRoot, 'model-cache')], { env: isolatedEnv })

const manifest = {
  schemaVersion: 1, architecture: process.arch, platform: process.platform,
  memoryPython: python.version, memoryPythonAbi: python.minor,
  localMemoryLockSha256: sha256(join(memoryProject, 'uv.lock')),
  workerSha256: {
    localMemory: sha256(join(memoryRoot, 'memory_worker.py')),
    keychainHelper: sha256(join(memoryRoot, 'bin/memory-keychain-helper')),
    providerKeychainHelper: sha256(join(memoryRoot, 'bin/provider-keychain-helper')),
    imageTextExtractor: sha256(join(memoryRoot, 'bin/image-text-extractor'))
  },
  embedding: { model: 'BAAI/bge-small-zh-v1.5', dimensions: 512, onnxSha256: modelHash }
}
writeFileSync(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify({ runtimeRoot, bytes: filesBelow(runtimeRoot).reduce((total, path) => total + statSync(path).size, 0), manifest }, null, 2))
