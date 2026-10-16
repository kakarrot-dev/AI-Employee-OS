// Adapted from open-claude-ui/code-examples/tailwind.config.js (MIT).
module.exports = {
  darkMode: ['selector', '[data-mode="dark"]'],
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: { DEFAULT: 'var(--cds-clay)', hover: 'var(--cds-clay-hover)', light: 'var(--cds-clay-light)' },
        surface: { 0: 'var(--cds-surface-0)', 1: 'var(--cds-surface-1)', 2: 'var(--cds-surface-2)', 3: 'var(--cds-surface-3)', popover: 'var(--cds-surface-popover)' }
      },
      fontFamily: {
        sans: ['AnthropicSans', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'sans-serif'],
        serif: ['AnthropicSerif', 'Newsreader', 'ui-serif', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace']
      },
      opacity: { 35: '.35' },
      boxShadow: { '2xs': '0 1px 2px rgb(0 0 0 / .04)', xs: 'var(--cds-shadow-sm)' }
    }
  },
  plugins: []
}
