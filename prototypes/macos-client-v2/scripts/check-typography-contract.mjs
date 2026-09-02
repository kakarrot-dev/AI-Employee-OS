import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const contract = await readFile(`${root}/src/typography.css`, 'utf8')

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collectCssFiles(path)
    return entry.isFile() && entry.name.endsWith('.css') && entry.name !== 'typography.css' ? [path] : []
  }))
  return files.flat()
}

const requiredTokens = [
  '--type-navigation-size',
  '--type-list-title-size',
  '--type-body-size',
  '--type-control-size',
  '--type-input-size',
  '--type-meta-size',
  '--type-modal-title-size',
  '--type-detail-summary-title-size',
  '--type-detail-summary-description-size',
  '--type-detail-metric-size',
  '--type-detail-section-title-size',
  '--type-detail-row-title-size',
  '--type-detail-row-support-size',
  '--type-markdown-h1-size',
  '--type-markdown-h2-size',
  '--type-markdown-h3-size',
  '--type-markdown-h4-size',
  '--type-markdown-code-size'
]

const missingTokens = requiredTokens.filter((token) => !contract.includes(`${token}:`))
const styleFiles = await collectCssFiles(`${root}/src`)
const rawRules = []

for (const file of styleFiles) {
  const styles = await readFile(file, 'utf8')
  for (const match of styles.matchAll(/(?:font-size|font-weight|line-height|letter-spacing):\s*([^;]+);/g)) {
    if (match[1].trim().startsWith('var(')) continue
    const line = styles.slice(0, match.index).split('\n').length
    rawRules.push(`${file.replace(`${root}/`, '')}:${line} ${match[0]}`)
  }
}

if (missingTokens.length || rawRules.length) {
  if (missingTokens.length) console.error(`缺少排版 Token: ${missingTokens.join(', ')}`)
  if (rawRules.length) console.error(`发现绕过排版契约的声明:\n${rawRules.join('\n')}`)
  process.exit(1)
}

console.log('排版契约检查通过')
