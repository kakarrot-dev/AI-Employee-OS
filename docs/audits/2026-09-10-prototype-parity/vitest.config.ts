import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Isolated acceptance probes; excluded from the project's default src/** suite.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test-setup.ts'],
    include: ['docs/audits/2026-09-10-prototype-parity/reproduce.test.tsx']
  }
})
