import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import { listPackage } from '@electron/asar'

const forbiddenDirectories = ['src/runtime', 'src/provider', 'src/preload', 'spikes', 'packaging', 'build/native', 'build/local-release', 'out/runtime', 'out/provider', 'out/preload']
const removedDependencies = ['@larksuiteoapi/node-sdk', 'axios', 'jszip', 'pdfjs-dist']
const backendDependency = /^(?:@langchain\/|@anthropic-ai\/|@larksuiteoapi\/|openai$|langchain$|better-sqlite3$|sqlite3$|keytar$|express$|fastify$)/
const backendPath = /(?:^|\/)(?:runtime|provider|preload|spikes)(?:\/|$)/
const forbiddenMainIdentifiers = new Set(['ipcMain', 'ipcRenderer', 'utilityProcess', 'Worker', 'SharedWorker', 'spawn', 'spawnSync', 'fork', 'exec', 'execSync', 'execFile', 'execFileSync', 'fetch', 'WebSocket', 'XMLHttpRequest'])

function filesIn(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)])
}

// Exported so boundary failures can be verified against disposable fixture directories.
export function auditPrototype(root) {
  const errors = []
  for (const path of forbiddenDirectories) if (existsSync(join(root, path))) errors.push(`禁止残留目录：${path}`)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies })) {
    if (removedDependencies.includes(dependency) || backendDependency.test(dependency)) errors.push(`禁止后端依赖：${dependency}`)
  }
  const lockPath = join(root, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    for (const path of Object.keys(lock.packages ?? {})) {
      if (removedDependencies.some(dependency => path.endsWith(`node_modules/${dependency}`))) errors.push(`锁文件残留已删除依赖：${path}`)
    }
  }
  const mainFiles = filesIn(join(root, 'src/main'))
  if (mainFiles.length !== 1 || relative(root, mainFiles[0] ?? '') !== 'src/main/index.ts') errors.push('主进程必须仅包含 src/main/index.ts')
  for (const file of [...mainFiles, ...filesIn(join(root, 'src/renderer')), ...filesIn(join(root, 'src/shared'))]) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    const name = relative(root, file)
    const main = name.startsWith('src/main/')
    const source = readFileSync(file, 'utf8')
    function checkModule(module) {
      if (backendPath.test(module) || removedDependencies.includes(module) || backendDependency.test(module)) errors.push(`${name} 引入后端：${module}`)
      if (main && !['electron', 'node:path', 'node:url', '../shared/layout-contract'].includes(module)) errors.push(`${name} 超出窗口壳允许的依赖：${module}`)
      if (!main && (module.startsWith('node:') || builtinModules.includes(module) || module === 'electron')) errors.push(`${name} 引入原生运行能力：${module}`)
    }
    for (const match of source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g)) checkModule(match[1])
    if (/\b(?:import|require)\s*\(\s*(?!["'\s])/.test(source)) errors.push(`${name} 含无法审计的动态模块加载`)
    if (main) {
      for (const identifier of forbiddenMainIdentifiers) {
        if (new RegExp(`\\b${identifier}\\b`).test(source)) errors.push(`${name} 含禁止的后台能力：${identifier}`)
      }
    }
  }
  const builtMain = filesIn(join(root, 'out/main')).map(file => relative(root, file))
  if (builtMain.some(file => file !== 'out/main/index.js')) errors.push('out/main 残留非窗口壳构建文件')
  const asarPath = join(root, 'build/prototype-release/dist/AI Employee OS Prototype-darwin-arm64/AI Employee OS Prototype.app/Contents/Resources/app.asar')
  if (existsSync(asarPath)) {
    for (const entry of listPackage(asarPath)) {
      if (backendPath.test(entry) || /\/(?:node_modules|native)(?:\/|$)/.test(entry)) errors.push(`安装包含后端或运行依赖：${entry}`)
      if (entry.startsWith('/out/main/') && entry !== '/out/main/index.js') errors.push(`安装包含非窗口壳主进程文件：${entry}`)
    }
  }
  return [...new Set(errors)]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..')
  const errors = auditPrototype(root)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else console.log('原型边界检查通过：无后端目录/依赖，窗口壳与界面导入符合边界；已存在的构建及安装包无后端残留。')
}
