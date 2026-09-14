import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Put Electron Vite's CJS shim at module scope. SDK documentation contains import examples
// that its regex-based automatic insertion otherwise mistakes for executable imports.
const mainCommonJsShim = `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@larksuiteoapi/node-sdk', 'axios', 'botbuilder'] })],
    define: {
      'process.env.WS_NO_BUFFER_UTIL': '"1"',
      'process.env.WS_NO_UTF_8_VALIDATE': '"1"'
    },
    build: {
      commonjsOptions: { ignoreTryCatch: true },
      rollupOptions: {
        // ws has a pure-JavaScript fallback; keep optional native requires inside its try/catch.
        external: ['bufferutil', 'utf-8-validate'],
        output: { banner: mainCommonJsShim },
        input: {
          index: resolve('src/main/index.ts'),
          'provider/index': resolve('src/provider/index.ts'),
          'runtime/index': resolve('src/runtime/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
