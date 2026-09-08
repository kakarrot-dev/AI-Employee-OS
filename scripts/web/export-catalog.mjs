import { build } from 'vite'
import { execFileSync } from 'node:child_process'
await build({ configFile: false, build: { ssr: 'scripts/web/export-catalog.ts', outDir: 'out/web-catalog', emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'export-catalog.mjs' } } } })
execFileSync(process.execPath, ['out/web-catalog/export-catalog.mjs'], { stdio: 'inherit' })
